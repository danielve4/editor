const fs = require('fs');
const albums = require('./lyric-view.json');

let uniques = {};

for (let album of albums) {
  for (let song of album.songs) {
    let lyrics = song.lyrics.replace(/\n\n/g, " ").trim();
    lyrics = lyrics.replace(/\n/g, " ").split(" ");
    for (let i = 0; i < lyrics.length; i++) {
      uniques[lyrics[i]] = lyrics[i];
    }
  }
}

let uniArr = Object.keys(uniques);
uniArr.sort();


writeToFile(JSON.stringify(uniArr), 'uniques.json', 'uniques');


function writeToFile(content, fileName, description = false) {
  fs.writeFile(fileName, content, (error) => {
    if (error) {
      console.log(`Error writing ${description ? description : fileName}:`, error);
    }
    else if (description) console.log(`Content for ${description} was saved successfully!`);
  });
}