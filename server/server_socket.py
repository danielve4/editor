from flask import Flask, request, Response, jsonify, render_template, send_from_directory
from flask_socketio import SocketIO, emit, leave_room, join_room, rooms
import torch
import torch.nn.functional as F
from transformers import GPT2Tokenizer, GPT2LMHeadModel
from tqdm import trange
import time
import json
import eventlet

app = Flask(__name__, static_url_path='/static')
app.config['SECRET_KEY'] = 'wizard'
socketio = SocketIO(app, logger=True, engineio_logger=True)

print('Initializing models')
models = {
    'gpt2': GPT2LMHeadModel.from_pretrained('gpt2'),
    'gpt2-medium': GPT2LMHeadModel.from_pretrained('gpt2-medium'),
    'gpt2-large': GPT2LMHeadModel.from_pretrained('gpt2-large'),
    'gd-tf-xl-200': GPT2LMHeadModel.from_pretrained('/home/dvega3/transformers/gd-xl-tf-200'),
    'gd-pyt-xl-200': GPT2LMHeadModel.from_pretrained('/home/dvega3/transformers/examples/gd-xl-274-pyt/checkpoint-200'),
    'gd-tf-xl-274': GPT2LMHeadModel.from_pretrained('/home/dvega3/transformers/gd-xl-tf-274'),
    'gd-pyt-xl-274': GPT2LMHeadModel.from_pretrained('/home/dvega3/transformers/examples/gd-xl-274-pyt')
}

print('Initializing tokenizers')
tokenizers = {
    'gpt2': GPT2Tokenizer.from_pretrained('gpt2'),
    'gpt2-medium': GPT2Tokenizer.from_pretrained('gpt2-medium'),
    'gpt2-large': GPT2Tokenizer.from_pretrained('gpt2-large'),
    'gpt2-xl': GPT2Tokenizer.from_pretrained('gpt2-xl')
}

eventlet.monkey_patch()


def top_k_top_p_filtering(logits, top_k=0, top_p=0.0, filter_value=-float('Inf')):
    """ Filter a distribution of logits using top-k and/or nucleus (top-p) filtering
        Args:
            logits: logits distribution shape (batch size x vocabulary size)
            top_k > 0: keep only top k tokens with highest probability (top-k filtering).
            top_p > 0.0: keep the top tokens with cumulative probability >= top_p (nucleus filtering).
                Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751)
        From: https://gist.github.com/thomwolf/1a5a29f6962089e871b94cbd09daf317
    """
    top_k = min(top_k, logits.size(-1))  # Safety check
    if top_k > 0:
        # Remove all tokens with a probability less than the last token of the top-k
        indices_to_remove = logits < torch.topk(logits, top_k)[
            0][..., -1, None]
        logits[indices_to_remove] = filter_value

    if top_p > 0.0:
        sorted_logits, sorted_indices = torch.sort(logits, descending=True)
        cumulative_probs = torch.cumsum(
            F.softmax(sorted_logits, dim=-1), dim=-1)

        # Remove tokens with cumulative probability above the threshold
        sorted_indices_to_remove = cumulative_probs > top_p
        # Shift the indices to the right to keep also the first token above the threshold
        sorted_indices_to_remove[...,
                                 1:] = sorted_indices_to_remove[..., :-1].clone()
        sorted_indices_to_remove[..., 0] = 0

        # scatter sorted tensors to original indexing
        indices_to_remove = sorted_indices_to_remove.scatter(
            dim=1, index=sorted_indices, src=sorted_indices_to_remove)
        logits[indices_to_remove] = filter_value
    return logits


def tokenize_input(string, model_name, num_samples=1, device='cpu'):
    tokens = tokenizers[model_name].encode(string, add_special_tokens=False)
    tokens = torch.tensor(tokens, dtype=torch.long, device=device)
    tokens = tokens.unsqueeze(0).repeat(num_samples, 1)
    return tokens


def generate_tokens_with(context_str, model_name, prev_generated=None, length=1, num_samples=1, temperature=1, top_k=0, top_p=0.0, repetition_penalty=1.0, device='cpu'):
    # Tokenizing context
    tokenizer_name = 'gpt2-xl' if 'xl' in model_name else model_name
    if prev_generated is not None:
        generated = prev_generated
        print("Using prev_generated")
    elif context_str is not None:
        generated = tokenize_input(context_str, tokenizer_name, device=device)
        print("Using context_str")

    next_tokens = torch.tensor([], dtype=torch.long, device=device)

    with torch.no_grad():
        for _ in trange(length):
            inputs = {'input_ids': generated}
            # Passing tokenized context to model. **inputs simply passes the 'generated' value
            outputs = models[model_name](**inputs)
            next_token_logits = outputs[0][:, -1, :] / \
                (temperature if temperature > 0 else 1.)

            for i in range(num_samples):
                for _ in set(generated[i].tolist()):
                    next_token_logits[i, _] /= repetition_penalty

            filtered_logits = top_k_top_p_filtering(
                next_token_logits, top_k=top_k, top_p=top_p)
            if temperature == 0:  # greedy sampling:
                next_token = torch.argmax(
                    filtered_logits, dim=-1).unsqueeze(-1)
            else:
                next_token = torch.multinomial(
                    F.softmax(filtered_logits, dim=-1), num_samples=1)
            generated = torch.cat((generated, next_token), dim=1)
            next_tokens = torch.cat((next_tokens, next_token), dim=1)

    text = tokenizers[tokenizer_name].decode(next_tokens[0].tolist())
    return text, generated


@app.route('/')
def index():
    return render_template('index.html')


@socketio.on('connect')
def test_connect():
    print('Client connected')
    join_room('clients')


@socketio.on('completion_request')
def writing_prediction(payload):
    print("completion_request")
    prediction_parameters = json.loads(payload)
    raw_text = str(prediction_parameters['text'])
    model_name = 'gpt2'
    length_per_sentence = 10
    samples = 1
    top_k = 40
    top_p = 0.9
    temperature = 1
    event_name_response = 'writing_suggestions'

    if 'model_name' in prediction_parameters:
        model_name_requested = str(prediction_parameters['model_name'])
        if model_name_requested in models:
            model_name = model_name_requested

    if 'length_per_sentence' in prediction_parameters:
        length_per_sentence = int(prediction_parameters['length_per_sentence'])

    if 'samples' in prediction_parameters:
        samples = int(prediction_parameters['samples'])

    if 'top_k' in prediction_parameters:
        top_k = int(prediction_parameters['top_k'])

    if 'top_p' in prediction_parameters:
        top_p = float(prediction_parameters['top_p'])

    if 'temperature' in prediction_parameters:
        temperature = float(prediction_parameters['temperature'])

    if 'event_name_response' in prediction_parameters:
        event_name_response = str(prediction_parameters['event_name_response'])

    prediction_tokens = []
    for _ in range(samples):
        text, _ = generate_tokens_with(raw_text,
                                       model_name,
                                       length=length_per_sentence,
                                       temperature=temperature,
                                       top_k=top_k,
                                       top_p=top_p)
        prediction_tokens.append(text)

    emit(event_name_response, {'data': json.dumps(prediction_tokens)})


@socketio.on('freeform_request')
def freeform_request(payload):
    print("freeform_request")
    freeform_parameters = json.loads(payload)
    raw_text = str(freeform_parameters['text'])
    model_name = 'gpt2'
    length_per_sentence = 5
    top_k = 40
    top_p = 0.9
    temperature = 1

    if 'model_name' in freeform_parameters:
        model_name_requested = str(freeform_parameters['model_name'])
        if model_name_requested in models:
            model_name = model_name_requested

    if 'length_per_sentence' in freeform_parameters:
        length_per_sentence = int(freeform_parameters['length_per_sentence'])

    if 'top_k' in freeform_parameters:
        top_k = int(freeform_parameters['top_k'])

    if 'top_p' in freeform_parameters:
        top_p = float(freeform_parameters['top_p'])

    if 'temperature' in freeform_parameters:
        temperature = float(freeform_parameters['temperature'])

    generated = None
    token_length_increment = min(length_per_sentence, 3)
    while length_per_sentence > 0 and len(rooms()) > 0:
        text, generated = generate_tokens_with(raw_text,
                                               model_name,
                                               prev_generated=generated,
                                               length=token_length_increment,
                                               temperature=temperature,
                                               top_k=top_k,
                                               top_p=top_p)
        length_per_sentence -= token_length_increment
        token_length_increment = length_per_sentence if length_per_sentence < token_length_increment else token_length_increment
        emit('freeform_completion', {'data': text})


@socketio.on('disconnect')
def test_disconnect():
    print('Client disconnected')
    leave_room('clients')


if __name__ == '__main__':
    socketio.run(app, port=5000, host='0.0.0.0')
