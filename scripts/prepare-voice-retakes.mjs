import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'docs/voice/慢语速重录');
mkdirSync(out, { recursive: true });
const read = name => JSON.parse(readFileSync(join(root, 'assets/voice', name), 'utf8')).entries;
const main = readFileSync(join(root, 'src/main.ts'), 'utf8');
const entries = (prefix, texts, animation='waving') => texts.map((message,i) => ({id:`${prefix}-${i+1}`,group:prefix,message,animation}));
const linePool = (name, prefix, animation) => {
  const match = main.slice(main.indexOf('const lines =')).match(new RegExp(`  ${name}: \\[(.*?)\\],`, 's'));
  if (!match) throw new Error(`Missing text pool ${name}`);
  return entries(prefix, [...match[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]), animation);
};
const checkins = [
  ...entries('checkin-09',['早呀，我已经到位啦。开始学习以后，和我打个招呼吧。','九点啦，一起把今天开个好头吧。','我来报到啦。你开始学习了吗？']),
  ...entries('checkin-12',['到中午啦。还在学习的话，给我一个“我在”吧。','十二点报到。我来看看，你还在不在。','上午走到这里啦。和我打个招呼，再去吃饭吧。']),
  ...entries('checkin-15',['三点啦，我们一起开始下午这一程。','我来偷偷看一眼。你准备认真了吗？','下午的约定时间到啦。进入学习后，记得报到哦。']),
  ...entries('checkin-18',['六点报到。今天也坚持到这里啦。','傍晚啦，我来确认一下你还在。','到六点这一站啦。还在学习的话，就和我打个招呼。']),
  ...entries('checkin-21',['九点啦。确认一下在场，再把今天的努力收好。','今天辛苦啦。我们一起看看，今天走到哪里了。','晚上的报到时间啦。还在学习的话，点一下让我知道。']),
  ...linePool('checkInSuccess','checkin-success','waving'),
  ...linePool('missed','checkin-missed','failed'),
];
const study = [
  ...linePool('studyStarted','study-started','waving'),
  ...linePool('studyStopped','study-stopped','review'),
  ...entries('launch-prompt',['先不想学多久。打开一页，我陪你把开头走过去。','不用等状态来。先开始一点，状态会慢慢跟上的。','我抓到你还没有开始啦。我们先翻开学习内容，好不好？'],'waiting'),
  ...entries('launch-snooze',['好，再给你一点准备时间。等一会儿，我再来找你。','那就稍后开始。记得，我们不是把今天取消了哦。'],'waiting'),
  ...entries('launch-skip',['好，这一段先跳过。我们在下一段重新开始。','收到，这次不催啦。照顾好自己，也别把约定忘掉。'],'review'),
  ...entries('launch-final',['准备时间到啦。我们现在就迈出第一步。','我又来拉你一下。先开始，别一直等一个完美的时机。'],'waiting'),
  ...entries('launch-success',['好啦，已经开始了。最难的那一步过去了。','你已经走进学习里啦。接下来，我就安静陪你。','我就知道你可以开始。好啦，我不再催你了。'],'jumping'),
  ...read('functional-v1.5.json').filter(x=>x.group==='study-launch-return'),
];
const patrol = [...main.matchAll(/voiceVariants\("(patrol-[^"]+|night-[^"]+)", \[(.*?)\], "([^"]+)"\)/gs)].flatMap(match =>
  entries(match[1], [...match[2].matchAll(/"([^"]+)"/g)].map(x=>x[1]
    .replaceAll('第一题','学习内容').replaceAll('打开题目','打开学习内容').replaceAll('看题目','看学习内容')
    .replace('现在，先做学习内容。','现在，先翻开一页。')
    .replace('看学习内容。现在就开始。','把注意力放回学习上。现在就开始。')
    .replace('先坐好，把题目打开。','先坐好，把学习内容打开。')
    .replace('先把学习内容做掉。','先把这一小段学起来。')
    .replace('十五分钟到啦。该从休息里回来喽。','休息有一会儿啦。准备好了，就回来继续吧。')
    .replace('已经稳稳开始三分钟啦。接下来交给你。','已经稳稳开始啦。接下来交给你。')),match[3]));
if (patrol.length !== 50) throw new Error(`Unexpected patrol count ${patrol.length}`);
const functional = read('functional-v1.5.json').filter(x=>['task-reminder-21','task-reminder-22','task-completed-extra','yuquiz-set-complete-extra'].includes(x.group))
  .map(x=>({...x,message:x.message
    .replace('今天还有几件事没划掉','今天的每日事项还有几件没划掉')
    .replace('任务栏里还有小尾巴哦。现在处理，还是认真留到明天？','每日事项还有小尾巴哦。现在处理，还是认真留到明天？')
    .replace('我来提醒一次就好。今天没完成的事情，记得看一眼。','今天的每日事项还没完成。方便的话，我们去看一眼。')
    .replace('睡前再看一眼任务吧。','睡前再看一眼每日事项吧。')
    .replace('今天还有没划掉的事情。','今天的每日事项还有没划掉的。')
    .replace('我最后再轻轻提醒一次。任务栏还没有完全收好。','再轻轻提醒一下。今天的每日事项还没有完全收好。')}));
const hourly = read('hourly-v1.5.json');
const batches = [
  ['01-在场打卡',checkins],['02-开始暂停与回归',study],
  ['03-巡逻与监督',patrol.filter(x=>!x.group.startsWith('night-'))],
  ['04-夜间散步与事项反馈',[...patrol.filter(x=>x.group.startsWith('night-')),...functional]],
  ['05-上午闲聊',hourly.filter(x=>x.group==='hourly-morning')],
  ['06-下午闲聊',hourly.filter(x=>x.group==='hourly-afternoon')],
  ['07-晚上闲聊',hourly.filter(x=>x.group==='hourly-evening')],
  ['08-零点晚安',hourly.filter(x=>x.group==='hourly-midnight')],
];
const seen = new Set();
for (const [name,list] of batches) {
  const tagged = list.map((entry,i)=> {
    if (seen.has(entry.id)) throw new Error(`Duplicate ${entry.id}`);
    seen.add(entry.id);
    // Remove obsolete synthesis strings when a spoken sentence has been revised.
    const cue = ['patrol-start-angry','patrol-start-final'].includes(entry.group) && i%3===0 ? '(哼)' : entry.group.startsWith('hourly-') && i%4===0 ? '(轻笑)' : '';
    const synth = entry.synth && entry.message === hourly.find(x=>x.id===entry.id)?.message
      ? entry.synth : `${cue}${entry.message.replace('。','。<#0.4#>')}`;
    return {...entry,synth};
  });
  writeFileSync(join(out,`${name}.txt`),tagged.map(x=>x.synth).join('\n\n<#2#>\n\n')+'\n','utf8');
  writeFileSync(join(out,`${name}.json`),JSON.stringify({version:'retake-slow-2026-09',entries:tagged},null,2)+'\n','utf8');
  console.log(`${name}: ${tagged.length}句`);
}
console.log(`共${seen.size}句。新生成的22句不重复纳入重录。`);
writeFileSync(join(out,'README.md'),`# 慢语速重录语料\n\n共159句，分8个文件。沿用你这次喜欢的音色与较慢语速；每次复制一个TXT的全部内容即可，不要复制编号或文件名。\n\n|文件|句数|内容|\n|---|---:|---|\n${batches.map(([name,list])=>`|[${name}.txt](${name}.txt)|${list.length}|${name.slice(3)}|`).join('\n')}\n\n## 生成注意事项\n\n- 保留段间的两秒停顿 <#2#>，句内 <#0.4#> 和语气标签也可以保留。不要额外加入标题或朗读编号。\n- 全部使用同一个音色和语速，完成后以相应文件名保存MP3，逐批交回。\n- 第03组只有第15至28句是更强的监督语气，可以只给这14句设置适度的“生气”情绪；其他部分以及生活闲聊不要统一套生气。\n- 第08组在零点使用，零点之后保持安静，并非通宵提醒。\n- 新生成的22句不需要再录；旧时长/双目标规则、旧悬赏和旧四种结算话术已排除。\n- 一些旧录音没有可靠的原文目录。本次整理是适配当前功能的重录稿，不是对所有旧MP3逐条听写。原音频未删除，也未直接改写现有运行台词目录。\n\n每份JSON保存对应音频编号、显示文字、语气与动画，方便切分后统一声画匹配。长文本建议分这8批生成，不要临时改变句子顺序。\n`,'utf8');
