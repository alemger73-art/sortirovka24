import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/lib/news.ts',import.meta.url),'utf8');
const context={exports:{},URL};vm.createContext(context);vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
const {instagramPost,splitNewsContent,youtubeVideo}=context.exports;
test('only real Instagram post/reel URLs become source links',()=>{
 assert.equal(instagramPost('https://instagram.com/reel/Ab_12/?igsh=abc'),'https://www.instagram.com/reel/Ab_12/');
 for(const url of ['javascript:alert(1)','https://instagram.com.evil.test/p/abc/','https://evil.test/p/abc/','https://instagram.com/profile/'])assert.equal(instagramPost(url),null);
});
test('source is separate from text without erasing ordinary paragraphs',()=>{
 const result=splitNewsContent('Story\n\nhttps://www.instagram.com/p/abc/');assert.equal(result.content,'Story');assert.equal(result.instagram,'https://www.instagram.com/p/abc/');
 assert.equal(splitNewsContent('Mention https://instagram.com/p/abc/ in text').content,'Mention https://instagram.com/p/abc/ in text');
});
test('video embeds reject arbitrary hosts and unsafe schemes',()=>{
 assert.equal(youtubeVideo('https://youtu.be/abcdefghijk'),'https://www.youtube-nocookie.com/embed/abcdefghijk');
 assert.equal(youtubeVideo('https://youtube.com.evil.test/watch?v=abcdefghijk'),null);assert.equal(youtubeVideo('javascript:alert(1)'),null);
});
