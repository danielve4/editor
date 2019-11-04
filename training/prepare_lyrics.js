const fs = require('fs');
const albums = require('./lyric-view.json');

let allLyrics = '';

for (let album of albums) {
  for (let song of album.songs) {
    allLyrics += song.lyrics;
    allLyrics += '\n<|endoftext|>\n';
  }
}

writeToFile(allLyrics,'lyrics.txt', 'lyrics');


function writeToFile(content, fileName, description = false) {
  fs.writeFile(fileName, content, (error) => {
    if (error) {
      console.log(`Error writing ${description ? description : fileName}:`, error);
    }
    else if (description) console.log(`Content for ${description} was saved successfully!`);
  });
}