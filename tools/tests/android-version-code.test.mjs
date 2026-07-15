import assert from 'node:assert/strict';
import {androidVersionCode} from '../android-version-code.mjs';

assert.equal(androidVersionCode('0.5.0',1),50001);
assert.equal(androidVersionCode('0.5.0',99),50099);
assert.equal(androidVersionCode('0.5.1',0),50100);
assert.equal(androidVersionCode('0.6.0',1),60001);
assert.equal(androidVersionCode('1.0.0',99),1000099);
assert.equal(androidVersionCode('1.2.3-beta.1',7),1020307);

assert.ok(androidVersionCode('0.5.1',0)>androidVersionCode('0.5.0',99));
assert.ok(androidVersionCode('0.6.0',0)>androidVersionCode('0.5.99',99));

for(const [version,slot] of [
  ['0.100.0',0],
  ['0.0.100',0],
  ['0.5.0',100],
  ['not-a-version',0],
]){
  assert.throws(()=>androidVersionCode(version,slot));
}

console.log('✅ deterministic candidate, production, patch, minor, and validation Android versionCode contract passed');
