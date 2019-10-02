const TAB = 9;


const editorOptions = {
  theme: 'snow',
  modules: {
    mention: {}
  }
};

const editor = new Quill('#editor', editorOptions);
const suggestions = editor.getModule('mention');

editor.keyboard.addBinding({ key: TAB }, () => {
  foo();
});

editor.keyboard.bindings[TAB].unshift(editor.keyboard.bindings[TAB].pop());

let foo = () => {
  suggestions.trigger(['daniel', 'vega']);
}
