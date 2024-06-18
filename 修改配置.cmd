if exist node_modules (
   node ./mod.js
) else (
   npm i --registry https://registry.npm.taobao.org
   node ./mod.js
)