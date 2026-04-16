let DATA = null;
const COLORS = ['#4A90D9','#67B279','#E8915A','#D46B8A','#9B8EC4','#5BBFB5','#E4C05C','#7CAFC4','#C4845C','#85A6D4'];
const charts = {};  // 缓存echarts实例

// ── Tab ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.tab).classList.add('active');
    // 切换tab后resize图表
    Object.values(charts).forEach(c => c && c.resize());
  });
});

// ── Upload ──
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

async function handleFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method:'POST', body:form });
  const data = await res.json();
  if (data.error) return alert(data.error);

  if (data.columns) {
    // 只有一个sheet，直接显示映射
    document.getElementById('sheetSection').style.display = 'none';
    populateSelects(data.columns);
    document.getElementById('mappingSection').style.display = '';
  } else {
    // 多个sheet，让用户选
    document.getElementById('mappingSection').style.display = 'none';
    var sheetDiv = document.getElementById('sheetButtons');
    sheetDiv.innerHTML = data.sheets.map(function(s) {
      return '<button class="btn-primary" onclick="selectSheet(\'' + s.replace(/'/g,"\\'") + '\')">' + s + '</button>';
    }).join('');
    document.getElementById('sheetSection').style.display = '';
  }
}

async function selectSheet(sheet) {
  var res = await fetch('/api/select_sheet', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({sheet:sheet})
  });
  var data = await res.json();
  if (data.error) return alert(data.error);
  document.getElementById('sheetSection').style.display = 'none';
  populateSelects(data.columns);
  document.getElementById('mappingSection').style.display = '';
}

function populateSelects(columns) {
  ['date','content','model','category','feedback'].forEach(field => {
    const sel = document.getElementById('map-' + field);
    const isRequired = field === 'date' || field === 'content';
    sel.innerHTML = isRequired ? '<option value="">请选择</option>' : '<option value="">不选择</option>';
    columns.forEach(c => { sel.innerHTML += `<option value="${c}">${c}</option>`; });
  });
  checkMapping();
}

['date','content','model','category','feedback'].forEach(f => {
  document.getElementById('map-' + f).addEventListener('change', checkMapping);
});
function checkMapping() {
  document.getElementById('btnAnalyze').disabled =
    !(document.getElementById('map-date').value && document.getElementById('map-content').value);
}

// ── Analyze ──
document.getElementById('btnAnalyze').addEventListener('click', analyze);
async function analyze() {
  document.getElementById('loadingOverlay').style.display = '';
  const mapping = {};
  ['date','content','model','category','feedback'].forEach(f => {
    mapping[f] = document.getElementById('map-' + f).value || '';
  });
  const res = await fetch('/api/analyze', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(mapping)
  });
  DATA = await res.json();
  document.getElementById('loadingOverlay').style.display = 'none';
  document.querySelectorAll('.tab-btn').forEach(b => b.disabled = false);
  // 跳转dashboard
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="dashboard"]').classList.add('active');
  document.getElementById('page-dashboard').classList.add('active');
  renderDashboard();
  renderDetail();
}

// ── Dashboard ──
function renderDashboard() {
  renderMetrics();
  // 未映射分类时显示提示
  var tip = document.getElementById('noSubTip');
  if (tip) tip.style.display = DATA.has_sub ? 'none' : '';
  renderPie('category');
  renderModel();
  renderTrend('weekly');
  renderWordcloud();
  renderTfidf();
  renderCatKeywords();
  renderUnattributed();
}

function renderMetrics() {
  const row = document.getElementById('metricsRow');
  let h = mc('总客诉', DATA.total.toLocaleString(), 'purple');
  if (DATA.has_sub) {
    h += mc('已归因', DATA.attributed.toLocaleString());
    h += mc('待归因', (DATA.total - DATA.attributed).toLocaleString());
    const top = topKey(DATA.sub_dist);
    if (top) h += mc('TOP 问题', top);
  } else if (DATA.has_category) {
    h += mc('分类数', Object.keys(DATA.category_dist).length);
    const top = topKey(DATA.category_dist);
    if (top) h += mc('TOP 分类', top);
  }
  row.innerHTML = h;
}
function mc(label, value, cls) {
  return `<div class="metric-card"><div class="metric-label">${label}</div><div class="metric-value ${cls||''}">${value}</div></div>`;
}
function topKey(obj) {
  if (!obj) return null;
  const entries = Object.entries(obj);
  if (!entries.length) return null;
  return entries.sort((a,b) => b[1]-a[1])[0][0];
}

// ── Pie ──
function renderPie(type) {
  const dist = type === 'sub' ? DATA.sub_dist : DATA.category_dist;
  const el = document.getElementById('chartPie');
  const noEl = document.getElementById('noPie');
  const toggleEl = document.getElementById('pieToggle');

  if (!dist || !Object.keys(dist).length) {
    el.style.display = 'none';
    if (toggleEl) toggleEl.style.display = 'none';
    if (noEl) noEl.style.display = '';
    return;
  }
  el.style.display = ''; if (toggleEl) toggleEl.style.display = ''; if (noEl) noEl.style.display = 'none';

  if (charts.pie) charts.pie.dispose();
  if (!el.offsetWidth) { setTimeout(function(){renderPie(type);}, 200); return; }
  charts.pie = echarts.init(el);
  const entries = Object.entries(dist).sort((a,b) => b[1]-a[1]);
  charts.pie.setOption({
    color: COLORS,
    tooltip: { trigger:'item', formatter:'{b}<br/>{c} 条 ({d}%)' },
    legend: { bottom:0, type:'scroll', textStyle:{fontSize:11} },
    series: [{
      type:'pie', radius:['40%','70%'], center:['50%','45%'],
      itemStyle: { borderRadius:8, borderColor:'#fff', borderWidth:3 },
      label: { show:true, fontSize:12, formatter:'{b}\n{d}%' },
      emphasis: { label:{fontSize:14, fontWeight:'bold'} },
      data: entries.map(([name,value]) => ({name,value}))
    }]
  });
}
document.querySelectorAll('[data-pie]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-pie]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPie(btn.dataset.pie);
  });
});

// ── Model ──
function renderModel() {
  const el = document.getElementById('chartModel');
  const noEl = document.getElementById('noModel');
  if (!DATA.model_top || !Object.keys(DATA.model_top).length) {
    el.style.display = 'none'; if (noEl) noEl.style.display = ''; return;
  }
  el.style.display = ''; if (noEl) noEl.style.display = 'none';

  if (charts.model) charts.model.dispose();
  if (!el.offsetWidth) { setTimeout(renderModel, 200); return; }
  charts.model = echarts.init(el);
  const entries = Object.entries(DATA.model_top).sort((a,b) => a[1]-b[1]);
  charts.model.setOption({
    tooltip: { trigger:'axis', axisPointer:{type:'shadow'} },
    grid: { left:130, right:40, top:15, bottom:15 },
    xAxis: { type:'value', splitLine:{lineStyle:{color:'rgba(0,0,0,0.04)'}}, axisLabel:{fontSize:11} },
    yAxis: { type:'category', data:entries.map(e=>e[0]), axisLabel:{fontSize:11, width:110, overflow:'truncate'} },
    series: [{
      type:'bar', data:entries.map(e=>e[1]), barWidth:18,
      itemStyle: {
        borderRadius:[0,10,10,0],
        color: new echarts.graphic.LinearGradient(0,0,1,0,[
          {offset:0,color:'#B8D4F0'},{offset:1,color:'#4A90D9'}
        ])
      },
      label: { show:true, position:'right', fontSize:11, color:'#1a1a1a' }
    }]
  });
}

// ── Trend ──
function renderTrend(freq) {
  const key = 'trend_' + freq;
  if (!DATA[key] || !DATA[key].dates || !DATA[key].dates.length) return;
  if (charts.trend) charts.trend.dispose();
  var trendEl = document.getElementById('chartTrend');
  if (!trendEl) return;
  if (!trendEl.offsetWidth) { setTimeout(function(){renderTrend(freq);}, 300); return; }
  charts.trend = echarts.init(trendEl);
  charts.trend.setOption({
    tooltip: { trigger:'axis' },
    grid: { left:55, right:30, top:25, bottom:35 },
    xAxis: { type:'category', data:DATA[key].dates, axisLabel:{fontSize:11, rotate:30},
             axisLine:{lineStyle:{color:'#e0e0e0'}}, boundaryGap:false },
    yAxis: { type:'value', splitLine:{lineStyle:{color:'rgba(0,0,0,0.04)'}}, axisLine:{show:false} },
    series: [{
      type:'line', data:DATA[key].counts, smooth:true, symbol:'circle', symbolSize:7,
      lineStyle:{width:2.5, color:'#1a1a1a'},
      itemStyle:{color:'#1a1a1a', borderColor:'#fff', borderWidth:2},
      areaStyle:{
        color: new echarts.graphic.LinearGradient(0,0,0,1,[
          {offset:0,color:'rgba(26,26,26,0.1)'},{offset:1,color:'rgba(26,26,26,0)'}
        ])
      }
    }]
  });
}
document.querySelectorAll('[data-trend]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-trend]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTrend(btn.dataset.trend);
  });
});

// ── Word Cloud (ECharts wordcloud) ──
function renderWordcloud() {
  const el = document.getElementById('chartWordcloud');
  if (!el || !DATA.top_words || !DATA.top_words.length) return;
  if (!el.offsetWidth) { setTimeout(renderWordcloud, 200); return; }

  if (charts.wc) charts.wc.dispose();
  charts.wc = echarts.init(el);
  const max = DATA.top_words[0][1];
  charts.wc.setOption({
    tooltip: { formatter: function(p) { return p.name + '：' + p.value + ' 次'; } },
    series: [{
      type: 'wordCloud',
      shape: 'circle',
      left: 'center', top: 'center',
      width: '90%', height: '90%',
      sizeRange: [14, 56],
      rotationRange: [-20, 20],
      rotationStep: 10,
      gridSize: 12,
      drawOutOfBound: false,
      textStyle: {
        fontFamily: 'Poppins, sans-serif',
        fontWeight: 600,
        color: function() {
          var palette = ['#4A90D9','#67B279','#E8915A','#D46B8A','#9B8EC4','#5BBFB5','#E4C05C'];
          return palette[Math.floor(Math.random() * palette.length)];
        }
      },
      emphasis: { textStyle: { shadowBlur: 10, shadowColor: 'rgba(108,92,231,0.3)' } },
      data: DATA.top_words.map(function(item) {
        return { name: item[0], value: item[1] };
      })
    }]
  });
}

// ── TF-IDF ──
function renderTfidf() {
  if (!DATA.tfidf || !DATA.tfidf.length) return;
  if (charts.tfidf) charts.tfidf.dispose();
  var tfidfEl = document.getElementById('chartTfidf');
  if (!tfidfEl || !tfidfEl.offsetWidth) { setTimeout(renderTfidf, 200); return; }
  charts.tfidf = echarts.init(tfidfEl);
  var items = DATA.tfidf.slice().reverse();
  charts.tfidf.setOption({
    tooltip: { trigger:'axis', axisPointer:{type:'shadow'},
               formatter: function(p) { return p[0].name + '<br/>TF-IDF: ' + p[0].value; } },
    grid: { left:90, right:40, top:15, bottom:15 },
    xAxis: { type:'value', splitLine:{lineStyle:{color:'rgba(0,0,0,0.04)'}}, axisLabel:{fontSize:11} },
    yAxis: { type:'category', data:items.map(function(i){return i[0];}), axisLabel:{fontSize:11} },
    series: [{
      type:'bar', data:items.map(function(i){return i[1];}), barWidth:16,
      itemStyle: {
        borderRadius:[0,8,8,0],
        color: new echarts.graphic.LinearGradient(0,0,1,0,[
          {offset:0,color:'#D6E8F7'},{offset:1,color:'#4A90D9'}
        ])
      },
      label: { show:true, position:'right', fontSize:10, color:'#4A90D9',
               formatter: function(p) { return p.value.toFixed(4); } }
    }]
  });
}

// ── Category Keywords ──
function renderCatKeywords() {
  if (!DATA.category_keywords) return;
  var wrap = document.getElementById('catKeywords');
  var el = document.getElementById('catKwContent');
  var entries = Object.entries(DATA.category_keywords);
  if (!entries.length) return;
  wrap.style.display = '';
  el.innerHTML = entries.map(function(e) {
    return '<div style="margin-bottom:0.8rem"><span class="rule-sub">' + e[0] +
           '</span> <span class="rule-kw">' + e[1].join(' · ') + '</span></div>';
  }).join('');
}

// ── Detail ──
var COL_NAMES = {date:'时间',content:'客诉内容',model:'机型',category:'分类',feedback:'客服反馈',sub_category:'细分归因'};

function renderDetail(filter) {
  if (!DATA || !DATA.detail || !DATA.detail.length) return;
  var rows = DATA.detail;
  if (filter) {
    var q = filter.toLowerCase();
    rows = rows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().indexOf(q) >= 0; });
    });
  }
  document.getElementById('detailCount').textContent = rows.length + ' 条';
  var cols = Object.keys(DATA.detail[0]);
  document.getElementById('detailHead').innerHTML =
    '<tr>' + cols.map(function(c) { return '<th>' + (COL_NAMES[c]||c) + '</th>'; }).join('') + '</tr>';
  document.getElementById('detailBody').innerHTML =
    rows.slice(0,500).map(function(r) {
      return '<tr>' + cols.map(function(c) { return '<td>' + (r[c]||'') + '</td>'; }).join('') + '</tr>';
    }).join('');
}
document.getElementById('searchInput').addEventListener('input', function(e) { renderDetail(e.target.value); });

// ── Rules ──
async function loadRules() {
  var res = await fetch('/api/rules');
  var rules = await res.json();
  var el = document.getElementById('rulesList');
  var entries = Object.entries(rules);
  if (!entries.length) { el.innerHTML='<div class="card"><p style="color:#8b8b9e">暂无规则</p></div>'; return; }
  el.innerHTML = entries.map(function(e) {
    var cat = e[0], subs = e[1];
    return '<div class="card rule-group"><div class="rule-group-title">' + cat + '</div>' +
      subs.map(function(r,i) {
        return '<div class="rule-item"><span class="rule-sub">' + r.sub_category +
               '</span><span class="rule-kw">' + r.keywords.join(' · ') +
               '</span><button class="rule-del" onclick="deleteRule(\'' + cat.replace(/'/g,"\\'") + '\',' + i + ')">✕</button></div>';
      }).join('') + '</div>';
  }).join('');
}

async function deleteRule(cat, idx) {
  var res = await fetch('/api/rules');
  var rules = await res.json();
  rules[cat].splice(idx, 1);
  if (!rules[cat].length) delete rules[cat];
  await fetch('/api/rules', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(rules)});
  loadRules();
}

document.getElementById('btnAddRule').addEventListener('click', async function() {
  var cat = document.getElementById('newCat').value.trim();
  var sub = document.getElementById('newSub').value.trim();
  var kw = document.getElementById('newKw').value.trim();
  if (!cat || !sub || !kw) return alert('请填写完整');
  var res = await fetch('/api/rules');
  var rules = await res.json();
  if (!rules[cat]) rules[cat] = [];
  rules[cat].push({sub_category:sub, keywords:kw.split(',').map(function(s){return s.trim();}).filter(Boolean)});
  await fetch('/api/rules', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(rules)});
  document.getElementById('newCat').value = '';
  document.getElementById('newSub').value = '';
  document.getElementById('newKw').value = '';
  loadRules();
});

// ── Resize ──
window.addEventListener('resize', function() {
  Object.values(charts).forEach(function(c) { if (c) c.resize(); });
});

// ── Unattributed Analysis ──
async function renderUnattributed() {
  if (!DATA || !DATA.has_sub) return;
  var res = await fetch('/api/unattributed');
  var d = await res.json();
  var wrap = document.getElementById('unattributed');
  if (!d.count) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  document.getElementById('unAttrCount').innerHTML =
    '<span class="badge">' + d.count + ' 条待归因</span>  占比 ' +
    Math.round(d.count / DATA.total * 100) + '%';

  // 高频词标签（点击复制到关键词输入框）
  var wordsEl = document.getElementById('unAttrWords');
  wordsEl.innerHTML = d.top_words.map(function(item) {
    return '<span class="word-tag-mini" title="点击添加到规则关键词" onclick="copyWord(\'' +
           item[0].replace(/'/g, "\\'") + '\')">' + item[0] +
           '<small style="opacity:0.6;margin-left:3px">' + item[1] + '</small></span>';
  }).join('');

  // TF-IDF 横向条
  var tfidfEl = document.getElementById('unAttrTfidf');
  if (d.tfidf && d.tfidf.length) {
    var maxScore = d.tfidf[0][1];
    tfidfEl.innerHTML = d.tfidf.map(function(item) {
      var pct = Math.round(item[1] / maxScore * 100);
      return '<div class="tfidf-row"><span class="tfidf-label">' + item[0] +
             '</span><div class="tfidf-bar" style="width:' + pct + '%"></div><span class="tfidf-score">' +
             item[1].toFixed(4) + '</span></div>';
    }).join('');
  }

  // 样例
  var samplesEl = document.getElementById('unAttrSamples');
  samplesEl.innerHTML = d.samples.map(function(s) {
    return '<div class="sample-item">' + s + '</div>';
  }).join('');
}

function copyWord(word) {
  navigator.clipboard.writeText(word);
  var kwInput = document.getElementById('newKw');
  if (kwInput.value) {
    kwInput.value += ', ' + word;
  } else {
    kwInput.value = word;
  }
}

loadRules();
