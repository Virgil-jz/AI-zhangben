// 每日账本：多API余额监控 + 微信推送
var fs = require('fs');
var path = require('path');
var DATA_FILE = path.join(__dirname, '账本.json');
var SENDKEY = 'SCT350833TQ7g77trLmEErRK4oH3cLC6On';

var providers = [
  { name:'API易', key:'sk-KYpuPuJY5aWYv6EmC0B695B1E9A24106B3762cBcE11b44C1',
    url:'https://vip.apiyi.com/v1/dashboard/billing/usage',
    parse:function(r){return{val:(r.total_usage||0)/100};}, currency:'USD', alertAt:2, field:'val',
    showNote:'$4.01（你报的余额）' },
  { name:'DeepSeek', key:'sk-bc4238532c354f058be3d64f3426da3d',
    url:'https://api.deepseek.com/user/balance',
    parse:function(r){var b=r.balance_infos?.[0];return{val:parseFloat(b?.total_balance||'0')};}, currency:'CNY', alertAt:20, field:'val' },
  { name:'硅基流动', key:'sk-ofdtrlzshqxrvvmfmxaisimejuymihefwswtngtfhdgkjcwb',
    url:'https://api.siliconflow.cn/v1/user/info',
    parse:function(r){return{val:parseFloat(r.data?.chargeBalance||'0')};}, currency:'CNY', alertAt:5, field:'val' },
  { name:'火山引擎', key:null, url:null, parse:null, currency:'CNY', alertAt:20, field:'val', manual:true, manualNote:'¥79.10（手动查询）' }
];

async function main() {
  var today = new Date().toISOString().slice(0,10);
  var history = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE,'utf-8')) : {};
  var yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  var yData = history[yesterday.toISOString().slice(0,10)] || {};
  var tData = {}, alerts = [], lines = [], wxLines = [];

  console.log('=== 每日账本 ' + today + ' ===\n');
  var rows = [];
  var alerts = [];

  for (var i = 0; i < providers.length; i++) {
    var p = providers[i], val, delta, status = '';

    if (p.manual) {
      console.log(p.name + ': ' + p.manualNote);
      rows.push({ name:p.name, bal:p.manualNote, delta:'-', cur:p.currency, alert:false });
      tData[p.name] = { val: null };
      continue;
    }

    try {
      var res = await fetch(p.url, { headers: {'Authorization':'Bearer '+p.key} });
      val = p.parse(await res.json()).val;
      var prev = (yData[p.name] || {}).val;
      delta = prev !== undefined ? (prev - val).toFixed(2) : '-';
      tData[p.name] = { val: val };

      var balStr = p.showNote ? p.showNote : p.currency + ' ' + val.toFixed(2);
      var deltaNum = parseFloat(delta);
      var deltaStr = delta === '-' ? '-' : (deltaNum > 0 ? '↑' + p.currency + delta : (deltaNum < 0 ? '↓' + p.currency + Math.abs(deltaNum) : '='));
      var isAlert = p.field === 'val' && val < p.alertAt && !p.showNote;

      console.log(p.name + ': ' + balStr + ' | 今日: ' + deltaStr);
      rows.push({ name:p.name, bal:balStr, delta:deltaStr, cur:p.currency, alert:isAlert });

      if (isAlert) alerts.push(p.name + ' 余' + p.currency + val.toFixed(2) + '（低于' + p.currency + p.alertAt + '）');
    } catch(e) {
      console.log(p.name + ': 查询失败');
      rows.push({ name:p.name, bal:'❌ 查询失败', delta:'-', cur:p.currency, alert:false });
      tData[p.name] = yData[p.name] || {};
    }
  }

  // 手机友好格式：每条一行，不用表格线
  var itemLines = rows.map(function(r){
    var alert = r.alert ? ' ⚠' : '';
    return '▎' + r.name + alert + '\n   余额 ' + r.bal + '   今日 ' + r.delta;
  });

  var alertText = '';
  if (alerts.length) {
    alertText = '\n⚠ ' + alerts.join('\n⚠ ');
    console.log('\n⚠ 余额告警:');
    alerts.forEach(function(a){ console.log('  ' + a); });
  }

  var text = '💰 每日账本 ' + today + '\n\n' + itemLines.join('\n\n') + alertText + '\n\n── 每日23:07自动推送 ──';

  // 发送微信
  try {
    var wxRes = await fetch('https://sctapi.ftqq.com/' + SENDKEY + '.send', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ title: '💰 每日账本 ' + today, desp: text })
    });
    var wxJson = await wxRes.json();
    console.log('\n微信推送: ' + (wxJson.code === 0 ? '✓ 成功' : '✗ ' + JSON.stringify(wxJson).slice(0,100)));
  } catch(e) {
    console.log('\n微信推送: ✗ ' + e.message);
  }

  history[today] = tData;
  var keys = Object.keys(history).sort();
  keys.slice(0, Math.max(0, keys.length - 30)).forEach(function(k){delete history[k];});
  fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2));
}
main().catch(function(e){console.error(e.message);});
