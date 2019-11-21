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

editor.keyboard.addBinding({ key: TAB }, () => {
  foo();
});

editor.keyboard.bindings[TAB].unshift(editor.keyboard.bindings[TAB].pop());

let foo = async () => {
  const editorText = editor.getText(0, suggestions.getCursorPos());
  const context = getPaddingText() + editorText;
  const payload = { 'text': context }
  suggestions.trigger(await predictions(payload));
}


const predictions = async (text) => {
  const url = 'http://98.253.67.62:1338/predict';
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

const getPaddingText = () => paddingText.value + "\n";
