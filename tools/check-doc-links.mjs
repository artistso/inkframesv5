#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import {fileURLToPath} from 'node:url';

const EXTERNAL_SCHEME=/^(?:https?|mailto|tel|data|javascript):/i;
const TEMPLATE_TOKEN=/\{\{[^}]+\}\}|\$\{[^}]+\}|<[^>]+>/;
const HTML_LINK=/<(?:a|img)\b[^>]*?\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const REFERENCE_DEFINITION=/^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/;

function insideRoot(root,path){
  const rel=relative(root,path);
  return rel===''||(!rel.startsWith(`..${sep}`)&&rel!=='..'&&!isAbsolute(rel));
}

function lineWithoutInlineCode(line){
  const chars=[...line];
  for(let i=0;i<chars.length;){
    if(chars[i]!=='`'){i++;continue;}
    let width=1;while(chars[i+width]==='`')width++;
    const token='`'.repeat(width),end=line.indexOf(token,i+width);
    if(end<0){i+=width;continue;}
    for(let j=i;j<end+width;j++)chars[j]=' ';
    i=end+width;
  }
  return chars.join('');
}

function parseInlineDestination(line,start){
  let i=start;
  while(i<line.length&&/\s/.test(line[i]))i++;
  if(i>=line.length)return null;
  if(line[i]==='<'){
    const end=line.indexOf('>',i+1);
    return end<0?null:{target:line.slice(i+1,end),end:end+1};
  }
  let depth=0,target='';
  for(;i<line.length;i++){
    const ch=line[i];
    if(ch==='\\'&&i+1<line.length){target+=line[i+1];i++;continue;}
    if(ch==='('){depth++;target+=ch;continue;}
    if(ch===')'){
      if(depth===0)return {target,end:i};
      depth--;target+=ch;continue;
    }
    if(/\s/.test(ch)&&depth===0)return {target,end:i};
    target+=ch;
  }
  return target?{target,end:i}:null;
}

export function collectMarkdownTargets(text){
  const targets=[];
  let fence=null;
  const lines=String(text).split(/\r?\n/);
  for(let index=0;index<lines.length;index++){
    const original=lines[index],lineNumber=index+1;
    const marker=/^\s*(`{3,}|~{3,})/.exec(original);
    if(marker){
      const token=marker[1];
      if(!fence)fence={char:token[0],width:token.length};
      else if(token[0]===fence.char&&token.length>=fence.width)fence=null;
      continue;
    }
    if(fence)continue;
    const line=lineWithoutInlineCode(original);
    const reference=REFERENCE_DEFINITION.exec(line);
    if(reference)targets.push({line:lineNumber,target:reference[1]||reference[2],kind:'reference'});
    for(const match of line.matchAll(HTML_LINK)){
      targets.push({line:lineNumber,target:match[1]||match[2]||match[3],kind:'html'});
    }
    let cursor=0;
    while((cursor=line.indexOf('](',cursor))>=0){
      const parsed=parseInlineDestination(line,cursor+2);
      if(parsed&&parsed.target)targets.push({line:lineNumber,target:parsed.target,kind:'inline'});
      cursor=parsed?Math.max(parsed.end,cursor+2):cursor+2;
    }
  }
  return targets;
}

function normalizeTarget(raw){
  let target=String(raw||'').trim();
  if(!target||target.startsWith('#')||target.startsWith('//')||EXTERNAL_SCHEME.test(target))return {skip:true};
  target=target.replace(/\\([\\()[\]<> ])/g,'$1');
  if(TEMPLATE_TOKEN.test(target))return {skip:true};
  const cut=[target.indexOf('#'),target.indexOf('?')].filter(value=>value>=0).sort((a,b)=>a-b)[0];
  if(cut!==undefined)target=target.slice(0,cut);
  if(!target)return {skip:true};
  try{return {target:decodeURIComponent(target)};}
  catch{return {error:'invalid-encoding'};}
}

function resolveLocalTarget(root,source,target){
  const resolved=target.startsWith('/')?resolve(root,`.${target}`):resolve(dirname(source),target);
  if(!insideRoot(root,resolved))return {error:'outside-root',resolved};
  if(!existsSync(resolved))return {error:'missing',resolved};
  try{
    const stat=lstatSync(resolved);
    if(stat.isSymbolicLink()){
      const real=realpathSync(resolved);
      if(!insideRoot(root,real))return {error:'unsafe-symlink',resolved:real};
    }
  }catch{return {error:'unreadable',resolved};}
  return {resolved};
}

export function validateMarkdownFiles({root=process.cwd(),files}){
  const absoluteRoot=realpathSync(resolve(root));
  const sorted=[...files].map(file=>String(file)).sort((a,b)=>a.localeCompare(b));
  const failures=[];
  for(const file of sorted){
    const source=resolve(absoluteRoot,file);
    if(!insideRoot(absoluteRoot,source)||!existsSync(source)){
      failures.push({file,line:1,target:file,code:'missing-source',resolved:source});
      continue;
    }
    const text=readFileSync(source,'utf8');
    for(const item of collectMarkdownTargets(text)){
      const normalized=normalizeTarget(item.target);
      if(normalized.skip)continue;
      if(normalized.error){
        failures.push({file,line:item.line,target:item.target,code:normalized.error,resolved:''});
        continue;
      }
      const result=resolveLocalTarget(absoluteRoot,source,normalized.target);
      if(result.error)failures.push({file,line:item.line,target:item.target,code:result.error,resolved:result.resolved||''});
    }
  }
  return failures.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.target.localeCompare(b.target)||a.code.localeCompare(b.code));
}

function walkMarkdown(root,current=root,result=[]){
  for(const entry of readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(entry.name==='.git'||entry.name==='node_modules'||entry.name==='build'||entry.name==='dist')continue;
    const path=resolve(current,entry.name);
    if(entry.isDirectory())walkMarkdown(root,path,result);
    else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.md'))result.push(relative(root,path));
  }
  return result;
}

export function trackedMarkdownFiles(root=process.cwd()){
  try{
    return execFileSync('git',['ls-files','-z','--','*.md'],{cwd:root,encoding:'utf8'})
      .split('\0').filter(Boolean).sort((a,b)=>a.localeCompare(b));
  }catch{
    return walkMarkdown(resolve(root));
  }
}

export function formatFailure(failure,root=process.cwd()){
  const suffix=failure.resolved?` -> ${relative(resolve(root),failure.resolved)||'.'}`:'';
  return `${failure.file}:${failure.line} [${failure.code}] ${failure.target}${suffix}`;
}

function runCli(){
  const root=resolve(process.cwd());
  const files=trackedMarkdownFiles(root);
  const failures=validateMarkdownFiles({root,files});
  if(failures.length){
    console.error(`Documentation link validation failed (${failures.length}):`);
    for(const failure of failures)console.error(`- ${formatFailure(failure,root)}`);
    process.exitCode=1;
    return;
  }
  console.log(`✅ documentation links valid (${files.length} Markdown files)`);
}

const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)runCli();
