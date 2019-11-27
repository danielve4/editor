const TAB = 9;
const paddingText = document.getElementById('padding-text');

const editorOptions = {
  theme: 'snow',
  modules: {
    mention: {}
  }
};

const editor = new Quill('#editor', editorOptions);
const suggestions = editor.getModule('mention');

const askQuestionForm = document.getElementById('ask-question-form');
const questionInput = document.getElementById('question');
const answerOutput = document.getElementById('answer-output');


const freeformForm = document.getElementById('freeform-form');
const freeformInput = document.getElementById('freeform-text');
const freeformOutput = document.getElementById('freeform-output');

editor.keyboard.addBinding({ key: TAB }, () => {
  triggerWordPredictions();
});

editor.keyboard.bindings[TAB].unshift(editor.keyboard.bindings[TAB].pop());

let triggerWordPredictions = async () => {
  const editorText = editor.getText(0, suggestions.getCursorPos());
  const paddingText = getPaddingText();
  const context = paddingText ? (paddingText + '\n' + editorText) : '' + editorText;
  const payload = {
    "text": context ? context : '<|endoftext|>',
    "samples": 3,
    "length_per_setence": 4,
    "top_k": 40,
    "top_p": 0.9
  }
  suggestions.trigger(await predictions(payload));
}

const answerQuestion = async (e) => {
  e.preventDefault();
  let questionText = questionInput.value;
  if (questionText) {
    if (questionText.indexOf('?') < 0)
      questionText += '?';
    const formattedQA = `Q: ${questionText}\nA:`;
    const payload = {
      "text": formattedQA,
      "samples": 1,
      "length_per_setence": 70,
      "top_k": 40,
      "top_p": 0.9
    };
    answerOutput.innerHTML = 'Loading...';
    const answerText = await predictions(payload);
    if (answerText[0].indexOf('Q:') >= 0)
      answerText[0] = answerText[0].substring(0, answerText[0].indexOf('Q:'));
    answerText[0] = (answerText[0] + "").replace(/\n/g, '<br>');
    answerOutput.innerHTML = 'Answer: ' + answerText[0];
  }
}

askQuestionForm.addEventListener("submit", answerQuestion, false);

const finishFreeform = async (e) => {
  e.preventDefault();
  let freeformText = freeformInput.value;
  if (freeformText.length > 0) {
    const payload = {
      "text": freeformText,
      "samples": 1,
      "length_per_setence": 150,
      "top_k": 40,
      "top_p": 0.9
    };
    freeformOutput.innerHTML = 'Loading...';
    const freeformResponse = await predictions(payload);
    freeformText = (freeformText+"").replace(/\n/g, '<br>');
    freeformResponse[0] = (freeformResponse[0] + "").replace(/\n/g, '<br>');
    console.log(freeformResponse[0]);
    freeformOutput.innerHTML = `<strong>${freeformText}</strong>` + freeformResponse[0];
  }
}

freeformForm.addEventListener("submit", finishFreeform, false);

const predictions = async (text) => {
  const url = 'http://98.253.67.62:1338/predict';
  //const url = 'http://192.168.86.2:5000/predict';
  const response = await fetch(url, {
    method: "POST",
    cache: 'no-cache',
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(text)
  });
  return await response.json();
}

const getPaddingText = () => paddingText.value;
