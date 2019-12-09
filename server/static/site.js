class SocketHandler {
  constructor(socket) {
    this.socket = socket;
    this.registerBasicHandlers();
  }

  registerBasicHandlers() {
    this.socket.on('connect', () => {
      console.log('Connection for new request');
    });

    this.socket.on('disconnect', () => {
      console.log('Connection for request terminated');
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after ' + attemptNumber + ' attempts');
    });
  }

  registerCustomHandler(eventName, handler) {
    this.socket.on(eventName, handler);
  }

  emit(event_name, payload) {
    this.socket.close();
    this.socket.connect();
    this.socket.emit(event_name, payload);
  }
}

class UI {
  constructor(socketHandler) {
    this.editorTopK = document.getElementById('editor-top-k');
    this.editorTopP = document.getElementById('editor-top-p');
    this.editorTemperature = document.getElementById('editor-temperature');
    this.editorLength = document.getElementById('editor-length');
    this.editorModel = document.getElementById('editor-model');
    this.paddingText = document.getElementById('padding-text');

    this.qaTopK = document.getElementById('qa-top-k');
    this.qaTopP = document.getElementById('qa-top-p');
    this.qaTemperature = document.getElementById('qa-temperature');
    this.qaLength = document.getElementById('qa-length');
    this.qaModel = document.getElementById('qa-model');
    this.askQuestionForm = document.getElementById('ask-question-form');
    this.questionInput = document.getElementById('question');
    this.answerOutput = document.getElementById('answer-output');

    this.freeformTopK = document.getElementById('freeform-top-k');
    this.freeformTopP = document.getElementById('freeform-top-p');
    this.freeformTemperature = document.getElementById('freeform-temperature');
    this.freeformLength = document.getElementById('freeform-length');
    this.freeformModel = document.getElementById('freeform-model');
    this.freeformForm = document.getElementById('freeform-form');
    this.freeformInput = document.getElementById('freeform-text');
    this.freeformOutput = document.getElementById('freeform-output');

    this.io = socketHandler;
    this.editorInit();
    this.registerWritingPredictionAction();
    this.registerFreeformCompletionHandler();
    this.registerFreeFormEventListener();
    this.registerQAHandler();
    this.registerQAFormEventListener();
  }

  editorInit() {
    const TAB = 9;
    const editorOptions = {
      theme: 'snow',
      modules: {
        mention: {}
      }
    };
    this.editor = new Quill('#editor', editorOptions);
    this.suggestions = this.editor.getModule('mention');
    this.editor.keyboard.addBinding({ key: TAB }, () => {
      const paddingText = this.paddingText.value;
      const editorText = this.getTextInEditorUpToCursor();
      this.editorTabAction(paddingText, editorText);
    });
    this.editor.keyboard.bindings[TAB].unshift(this.editor.keyboard.bindings[TAB].pop());
  }

  registerWritingPredictionAction() {
    this.io.registerCustomHandler('writing_suggestions', (suggestions) => {
      suggestions = JSON.parse(suggestions.data);
      this.suggestions.trigger(suggestions);
    });
  }

  editorTabAction(paddingText, editorText) {
    const context = paddingText ? (paddingText + '\n' + editorText) : '' + editorText;
    const payload = {
      text: context ? context : '<|endoftext|>',
      samples: 3,
      length_per_sentence: this.editorLength.value,
      top_k: this.editorTopK.value,
      top_p: this.editorTopP.value,
      temperature: this.editorTemperature.value,
      model_name: this.editorModel.options[this.editorModel.selectedIndex].value
    };
    this.io.emit('completion_request', JSON.stringify(payload));
  }

  getTextInEditorUpToCursor() {
    return this.editor.getText(0, this.suggestions.getCursorPos());
  }

  registerFreeFormEventListener() {
    this.freeformForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let freeformText = this.freeformInput.value;
      if (freeformText && freeformText.length > 0) {
        const payload = {
          text: freeformText,
          length_per_sentence: this.freeformLength.value,
          top_k: this.freeformTopK.value,
          top_p: this.freeformTopP.value,
          temperature: this.freeformTemperature.value,
          event_name_response: 'freeform_completion',
          model_name: this.freeformModel.options[this.freeformModel.selectedIndex].value
        };
        this.freeformOutput.innerHTML = `<strong>${(freeformText + "").replace(/\n/g, '<br>')}</strong>`;
        this.io.emit('freeform_request', JSON.stringify(payload));
      }
    }, false)
  }

  registerFreeformCompletionHandler() {
    this.io.registerCustomHandler('freeform_completion', (completion) => {
      let freeformCompletion = (completion.data + "").replace(/\n/g, '<br>');
      this.freeformOutput.innerHTML += freeformCompletion;
    });
  }

  registerQAFormEventListener() {
    this.askQuestionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let questionText = this.questionInput.value;
      if (questionText && questionText.length > 0) {
        if (questionText.indexOf('?') < 0)
          questionText += '?';
        const formattedQA = `Q: ${questionText}\nA:`;
        const payload = {
          text: formattedQA,
          samples: 1,
          length_per_sentence: this.qaLength.value,
          top_k: this.qaTopK.value,
          top_p: this.qaTopP.value,
          temperature: this.qaTemperature.value,
          event_name_response: 'qa_answer',
          model_name: this.qaModel.options[this.qaModel.selectedIndex].value
        };
        this.answerOutput.innerHTML = 'Answering...';
        this.io.emit('completion_request', JSON.stringify(payload));
      }
    }, false);
  }

  registerQAHandler() {
    this.io.registerCustomHandler('qa_answer', (answer) => {
      let answerText = JSON.parse(answer.data)[0];

      if (answerText.indexOf('Q:') >= 0)
        answerText = answerText.substring(0, answerText.indexOf('Q:'));
      answerText = (answerText + "").replace(/\n/g, '<br>');
      this.answerOutput.innerHTML = 'Answer: ' + answerText;
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const socketHandler = new SocketHandler(io({ transports: ['websocket'] }));
  const app = new UI(socketHandler);
});
