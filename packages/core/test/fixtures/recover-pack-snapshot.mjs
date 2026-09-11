import {recoverLocalPackSnapshot} from '../../src/extensions/local-pack-staging.ts';
import {requireGovernedLocalPack} from '../../src/extensions/validate-current-pack.ts';
const snapshot=await recoverLocalPackSnapshot(process.argv[2],JSON.parse(process.argv[3]),{deadline:Date.now()+5000,signal:new AbortController().signal});
let bytes='';for await(const chunk of await snapshot.files.payload.open('input.json',{deadline:Date.now()+5000,signal:new AbortController().signal}))bytes+=Buffer.from(chunk).toString();
let grantsTrust=false;try{requireGovernedLocalPack(snapshot);grantsTrust=true;}catch{}
process.stdout.write(JSON.stringify({metadata:snapshot.metadata(),bytes,grantsTrust}));
