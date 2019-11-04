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

let foo = async () => {
  const r = editor.getText(0, suggestions.getCursorPos());
  const payload = {'text': r}
  const url = 'http://98.253.67.62:1338/predict';
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  suggestions.trigger(await response.json());
}


const predictions = async (text) => {
  const url = 'http://127.0.0.1:5000/predict';
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(text)
  });
  return await response.json();
} 
