class SocketHandler {
  constructor(socket) {
    this.socket = socket;
    this.registerBasicHandlers();
  }

  registerBasicHandlers() {
    this.socket.on('connect', () => {
      // $('html').removeClass();
      // $('html').addClass('connected');
      console.log('Connected!');
    });

    this.socket.on('disconnect', () => {
      // $('html').removeClass();
      // $('html').addClass('disconnected');
      console.log('Disconnected from socket...');
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after ' + attemptNumber + ' attempts');
    });
  }

  registerCustomHandler(eventName, handler) {
    this.socket.on(eventName, handler);
  }
}

class UI {
  constructor(socketHandler) {
    this.paddingText = document.getElementById('padding-text');
    this.askQuestionForm = document.getElementById('ask-question-form');
    this.questionInput = document.getElementById('question');
    this.answerOutput = document.getElementById('answer-output');
    this.freeformForm = document.getElementById('freeform-form');
    this.freeformInput = document.getElementById('freeform-text');
    this.freeformOutput = document.getElementById('freeform-output');
    this.io = socketHandler;
    this.editorInit();
    this.registerWritingPredictionAction();
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
      length_per_sentence: 3,
      top_k: 40,
      top_p: 0.9
    };
    this.io.socket.emit('writing_prediction', JSON.stringify(payload));
  }

  getTextInEditorUpToCursor() {
    return this.editor.getText(0, this.suggestions.getCursorPos());
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const socketHandler = new SocketHandler(io());
  const app = new UI(socketHandler);
});
