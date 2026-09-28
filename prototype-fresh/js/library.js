/* Library and template composer. Uses the existing screen, sheet and action
   system; search updates only results so typing never loses focus. */
const Library = (() => {
  const { esc, act, Btn, TopBar, TabBar } = UI;
  const defaults = { tab: 'exercises', query: '', group: 'Все', equipment: 'all', favorites: false, demos: false };
  const view = () => ({ ...defaults, ...Store.get().libraryView });
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[-–]/g, ' ');
  const matches = (query, value) => norm(query).trim().split(/\s+/).every(word => norm(value).includes(word));
  const countLabel = n => `${n} ${DB.plural(n, ['упражнение', 'упражнения', 'упражнений'])}`;
  const star = filled => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3l-5.7 2.9 1.1-6.2-4.5-4.4 6.3-.9Z"/></svg>`;
  let draft = null, error = '', draftError = '', pickerQuery = '', pending = null;

  function equipment(e) {
    if (e.group.includes('·')) return e.group.split('·')[1].trim();
    if (e.bodyweight) return 'вес тела';
    const name = norm(e.name);
    if (/гантел|молотков/.test(name)) return 'гантели';
    if (/штанг|гриф|французск|узким хватом/.test(name)) return 'штанга';
    if (/блок|кроссовер|канат/.test(name)) return 'блок';
    if (/тренаж|смит|бабочк/.test(name)) return 'тренажёр';
    return 'другое';
  }
  function filtered() {
    const v = view();
    return Store.logging.library().filter(e =>
      matches(v.query, [e.name, ...(e.aliases || []), e.group, equipment(e)].join(' ')) &&
      (v.group === 'Все' || e.group.split(' · ')[0] === v.group) &&
      (v.equipment === 'all' || equipment(e) === v.equipment) &&
      (!v.favorites || TemplateRepository.isFavorite(e.name)) && (!v.demos || e.gif)
    ).sort((a, b) => Number(Boolean(b.gif)) - Number(Boolean(a.gif)) || a.name.localeCompare(b.name, 'ru'));
  }
  function thumb(e, size = '') {
    return `<span class="lib-thumb ${size}">${e.image ? `<img src="${esc(e.image)}" alt="" width="64" height="64" loading="lazy">` : Icon.get('dumbbell', { size: 24 })}</span>`;
  }
  function results() {
    const v = view();
    if (v.tab === 'templates') {
      const templates = DB.templates.filter(t => matches(v.query, `${t.name} ${t.description || ''} ${DB.programFor(t.program).map(e => e.name).join(' ')}`));
      return `<div class="lib-result-heading"><h2>Ваши шаблоны</h2><span>${templates.length}</span></div>
        ${templates.length ? `<div class="lib-template-list">${templates.map(templateCard).join('')}</div>` : empty('Шаблоны не найдены', 'Попробуйте другое название или создайте свой план.', Btn('Сбросить поиск', { kind: 'soft', a: 'lib.reset' }))}`;
    }
    const items = filtered();
    return `<div class="lib-result-heading"><h2>${v.favorites ? 'Избранное' : v.group === 'Все' ? 'Все упражнения' : esc(v.group)}</h2><span aria-live="polite">${countLabel(items.length)}</span></div>
      ${items.length ? `<ul class="lib-exercises">${items.map(e => `<li class="lib-exercise">
        <button class="lib-exercise__open" ${act('sheet.open', { id: 'libraryExercise', name: e.name })}>
          ${thumb(e)}<span class="lib-exercise__text"><b>${esc(e.name)}</b><span>${esc(e.group.split(' · ')[0])} · ${esc(equipment(e))}</span>${e.gif ? '<small>Демонстрация и техника</small>' : ''}</span>
        </button><button class="lib-favorite ${TemplateRepository.isFavorite(e.name) ? 'is-on' : ''}" ${act('lib.favorite', { name: e.name })} aria-label="${TemplateRepository.isFavorite(e.name) ? 'Убрать из избранного' : 'В избранное'}: ${esc(e.name)}" aria-pressed="${TemplateRepository.isFavorite(e.name)}">${star(TemplateRepository.isFavorite(e.name))}</button>
      </li>`).join('')}</ul>` : empty(v.favorites ? 'Пока нет избранных упражнений' : 'Ничего не нашлось', v.favorites ? 'Отмечайте упражнения звёздочкой, чтобы быстро находить их здесь.' : 'Измените запрос или снимите часть фильтров.', Btn('Показать все упражнения', { kind: 'soft', a: 'lib.reset' }))}`;
  }
  function empty(title, text, action = '') { return `<div class="lib-empty">${Icon.get('search', { size: 28 })}<h3>${title}</h3><p>${text}</p>${action}</div>`; }
  function templateCard(t) {
    const list = DB.programFor(t.program), total = list.reduce((n, e) => n + e.sets, 0);
    return `<button class="lib-template-card" ${act('template.open', { id: t.id })}>
      <span class="lib-template-card__top"><span class="lib-eyebrow">${t.custom ? 'Мой шаблон' : 'Готовый план'}</span>${Icon.get('arrowRight', { size: 20 })}</span>
      <b>${esc(t.name)}</b><span class="lib-template-card__summary">${countLabel(list.length)} <i>·</i> ${total} ${DB.plural(total, ['подход', 'подхода', 'подходов'])}</span>
      <span class="lib-template-card__preview">${list.slice(0, 3).map((e, i) => `<span><em>${String(i + 1).padStart(2, '0')}</em>${esc(e.name)}</span>`).join('')}</span>
      ${list.length > 3 ? `<small>Ещё ${list.length - 3} ${DB.plural(list.length - 3, ['упражнение', 'упражнения', 'упражнений'])}</small>` : ''}</button>`;
  }
  function screen() {
    const v = view(), all = Store.logging.library(), savedDraft = draft || TemplateRepository.readDraft();
    const groups = ['Все', ...new Set(all.map(e => e.group.split(' · ')[0]))];
    return `<div class="screen library-screen">
      <div class="screen__body lib-body">
        <header class="lib-heading"><span class="lib-eyebrow">Рабочая коллекция</span><h1>Библиотека</h1><p>Упражнения и планы, которые всегда под рукой.</p></header>
        <div class="lib-tabs" role="group" aria-label="Раздел библиотеки">${[['exercises','Упражнения',all.length],['templates','Шаблоны',DB.templates.length]].map(([id,label,n]) => `<button ${act('lib.tab', { id })} aria-pressed="${v.tab === id}" class="${v.tab === id ? 'is-on' : ''}">${label}<span>${n}</span></button>`).join('')}</div>
        ${v.tab === 'templates' ? `<div class="lib-create"><div><h2>План начинается здесь</h2><p>Соберите тренировку один раз.<br>Используйте с любым клиентом.</p></div>${Btn('Создать шаблон', { icon: 'plus', a: 'builder.new', size: 'compact' })}</div>${savedDraft ? `<button class="lib-draft" ${act('builder.resume')}>${Icon.get('edit', { size: 20 })}<span><b>${esc(savedDraft.name || 'Новый шаблон')}</b><small>Незавершённый черновик · продолжить</small></span>${Icon.get('chevR', { size: 18 })}</button>` : ''}` : ''}
        <div class="lib-search">${Icon.get('search', { size: 20 })}<input id="library-query" data-library-query type="search" value="${esc(v.query)}" placeholder="${v.tab === 'templates' ? 'Название или упражнение' : 'Название, мышца, оборудование'}" aria-label="${v.tab === 'templates' ? 'Поиск шаблонов' : 'Поиск упражнений'}" autocomplete="off"></div>
        ${v.tab === 'exercises' ? `<div class="lib-groups" role="group" aria-label="Группа мышц">${groups.map(g => `<button ${act('lib.group', { value: g })} aria-pressed="${v.group === g}" class="${v.group === g ? 'is-on' : ''}">${esc(g)}</button>`).join('')}</div>
        <div class="lib-filters"><label class="lib-equipment">${Icon.get('filter', { size: 16 })}<select data-library-equipment aria-label="Оборудование"><option value="all">Оборудование</option>${[...new Set(all.map(equipment))].sort().map(e => `<option value="${esc(e)}" ${v.equipment === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label><button ${act('lib.toggle', { key: 'favorites' })} aria-pressed="${v.favorites}" class="${v.favorites ? 'is-on' : ''}">${star(v.favorites)}Избранное</button><button ${act('lib.toggle', { key: 'demos' })} aria-pressed="${v.demos}" class="${v.demos ? 'is-on' : ''}">${Icon.get('play', { size: 15 })}С техникой</button></div>` : ''}
        <section id="library-results" aria-label="Результаты поиска">${results()}</section>
      </div>${TabBar('trainer', 't-library')}</div>`;
  }
  function details() {
    const t = DB.templates.find(t => t.id === Store.get().selectedTemplate) || DB.templates[0];
    if (!t) return screen();
    const list = DB.programFor(t.program), sets = list.reduce((n, e) => n + e.sets, 0);
    return `<div class="screen library-screen">${TopBar({ back: 'nav.back', title: 'Шаблон', right: UI.iconBtn('copy', { act: 'builder.copy', args: { id: t.id }, label: 'Создать копию шаблона' }) })}
      <div class="screen__body lib-body lib-detail"><span class="lib-eyebrow">${t.custom ? 'Мой шаблон' : 'Готовый план'}</span><h1>${esc(t.name)}</h1><p class="lib-description">${esc(t.description || 'Готовая последовательность для следующей тренировки.')}</p>
      <div class="lib-plan-summary"><span><b>${list.length}</b> упражнений</span><span><b>${sets}</b> подходов</span></div>
      <div class="lib-result-heading"><h2>Порядок упражнений</h2>${Btn('Изменить', { kind: 'ghost', size: 'sm', full: false, a: 'builder.edit', args: { id: t.id } })}</div>
      <ol class="lib-plan-list">${list.map((e,i) => `<li><span class="lib-order">${String(i+1).padStart(2,'0')}</span><button ${act('sheet.open', { id:'libraryExercise', name:e.name })}><b>${esc(e.name)}</b><span>${e.sets} × ${esc(e.reps)}${e.target ? ` · ${DB.fmtNumber(e.target)} кг` : ''}${e.rest != null ? ` · отдых ${e.rest} сек` : ''}</span></button></li>`).join('')}</ol>
      </div><div class="lib-footer">${Btn('Создать занятие с этим планом', { a:'lib.use', args:{id:t.id}, icon:'calendarPlus' })}</div></div>`;
  }
  function blank() { return { id: null, name: '', description: '', exercises: [] }; }
  function begin(id, copy = false, force = false) {
    if (Store.get().role !== 'trainer') return;
    const existingDraft = draft || TemplateRepository.readDraft();
    if (!force && existingDraft) { pending = { id, copy }; Store.ui.openSheet('templateDraftConflict'); return; }
    const t = DB.templates.find(t => t.id === id);
    draft = t ? { id: copy ? null : t.id, name: t.name + (copy ? ' — копия' : ''), description:t.description || '', exercises: DB.programFor(t.program).map(e => ({name:e.name, sets:String(e.sets), reps:String(e.reps).replace(/\s*сек$/, ''), unit:e.unit || (/сек/.test(e.reps) ? 'сек':'повт'), target:String(e.target || ''), rest:String(e.rest ?? 90)})) } : blank();
    error = ''; persistDraft(); Store.silent({ sheet:null }); Store.nav.go('t-template-editor');
  }
  function persistDraft() { draftError = TemplateRepository.writeDraft(draft) ? '' : TemplateRepository.error(); }
  function resume() { draft = draft || TemplateRepository.readDraft() || blank(); error=''; Store.silent({sheet:null}); Store.nav.go('t-template-editor'); }
  function editor() {
    draft = draft || TemplateRepository.readDraft() || blank();
    return `<div class="screen library-screen template-editor">${TopBar({back:'builder.leave',title:draft.id ? 'Редактирование' : 'Новый шаблон',right:UI.iconBtn('trash',{act:'builder.discardAsk',label:'Удалить черновик'})})}
      <div class="screen__body lib-body">
        <div class="builder-intro"><span class="lib-eyebrow">Конструктор тренировки</span><h1>Соберите свой план</h1><p>От первого упражнения до последнего подхода.</p></div>
        <label class="builder-field"><span>Название шаблона</span><input id="template-name" data-builder-field="name" value="${esc(draft.name)}" maxlength="80" placeholder="Например, Ноги и ягодицы" autocomplete="off"></label>
        <label class="builder-field"><span>Заметка <small>необязательно</small></span><textarea data-builder-field="description" maxlength="400" rows="2" placeholder="Цель тренировки или подсказка для себя">${esc(draft.description)}</textarea></label>
        <div class="lib-result-heading"><h2>Упражнения</h2><span id="builder-count">${countLabel(draft.exercises.length)}</span></div>
        ${draft.exercises.length ? `<ol class="builder-exercises">${draft.exercises.map(editorExercise).join('')}</ol>` : `<div class="builder-empty">${Icon.get('layers',{size:32})}<h3>Начните с первого упражнения</h3><p>Выберите движения из библиотеки,<br>а затем настройте нагрузку.</p></div>`}
        ${Btn('Добавить упражнения', {kind:'soft',icon:'plus',a:'builder.pick',cls:'builder-add'})}
        <p class="builder-storage" id="builder-storage" role="status">${esc(draftError || 'Черновик сохраняется на этом устройстве.')}</p>
        <p class="builder-error" id="builder-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
      </div><div class="lib-footer builder-footer"><span id="builder-total">${draft.exercises.reduce((n,e)=>n+(Number(e.sets)||0),0)} подходов в плане</span>${Btn('Сохранить шаблон',{a:'builder.save',icon:'check'})}</div></div>`;
  }
  function editorExercise(e, i) {
    const all = draft.exercises.length;
    const field = (key,label,type='number',extra='') => `<label><span>${label}</span><input data-builder-ex="${i}" data-builder-key="${key}" type="${type}" value="${esc(e[key])}" aria-label="${label}: ${esc(e.name)}" ${extra}></label>`;
    return `<li class="builder-exercise"><div class="builder-exercise__heading"><span class="lib-order">${String(i+1).padStart(2,'0')}</span><h3>${esc(e.name)}</h3><button ${act('builder.remove',{index:i})} class="lib-icon-button" aria-label="Удалить: ${esc(e.name)}">${Icon.get('close',{size:18})}</button></div>
      <div class="builder-numbers">${field('sets','Подходы','number','min="1" max="20" inputmode="numeric"')}${field('reps',e.unit==='сек'?'Время, сек':'Повторения','text','inputmode="text" maxlength="9"')}${field('target','Вес, кг','text','inputmode="decimal" maxlength="7" placeholder="—"')}${field('rest','Отдых, сек','number','min="0" max="600" inputmode="numeric"')}</div>
      <div class="builder-exercise__bottom"><label>Считать <select data-builder-ex="${i}" data-builder-key="unit" aria-label="Единица: ${esc(e.name)}"><option value="повт" ${e.unit==='повт'?'selected':''}>повторения</option><option value="сек" ${e.unit==='сек'?'selected':''}>секунды</option></select></label><div><button class="lib-icon-button" ${act('builder.move',{index:i,delta:-1})} ${i===0?'disabled':''} aria-label="Выше: ${esc(e.name)}"><span class="lib-arrow-up">${Icon.get('chevD',{size:18})}</span></button><button class="lib-icon-button" ${act('builder.move',{index:i,delta:1})} ${i===all-1?'disabled':''} aria-label="Ниже: ${esc(e.name)}">${Icon.get('chevD',{size:18})}</button></div></div></li>`;
  }
  function pickerResults() {
    const items = Store.logging.library().filter(e => matches(pickerQuery,[e.name,...(e.aliases||[]),e.group].join(' ')));
    return items.length ? `<ul class="builder-picker-list">${items.map(e=>{const on=draft.exercises.some(x=>x.name===e.name);return `<li><button ${act('builder.select',{name:e.name})} aria-pressed="${on}">${thumb(e,'lib-thumb--small')}<span><b>${esc(e.name)}</b><small>${esc(e.group)}</small></span><span class="builder-check ${on?'is-on':''}">${Icon.get(on?'check':'plus',{size:18})}</span></button></li>`;}).join('')}</ul>` : empty('Нет подходящих упражнений','Попробуйте другое название.');
  }
  function picker() {
    return `<h2 class="sheet__title">Добавить упражнения</h2><p class="sheet__sub">Отметьте несколько — они появятся в вашем плане.</p><div class="lib-search"><span>${Icon.get('search',{size:20})}</span><input id="template-picker-query" data-picker-query type="search" value="${esc(pickerQuery)}" placeholder="Найти упражнение" aria-label="Поиск упражнений для шаблона"></div><div id="builder-picker-results">${pickerResults()}</div><div class="builder-picker-footer">${Btn(`Готово · ${countLabel(draft.exercises.length)}`,{a:'sheet.close'})}</div>`;
  }
  function sheet(id) {
    if (id === 'templatePicker') return picker();
    if (id === 'templateDiscard') return `<h2 class="sheet__title">Удалить черновик?</h2><p class="sheet__sub">Несохранённые изменения будут удалены. Сохранённый шаблон останется.</p><div class="lib-sheet-actions">${Btn('Продолжить редактирование',{a:'sheet.close'})}${Btn('Удалить черновик',{kind:'soft',a:'builder.discard'})}</div>`;
    if (id === 'templateDraftConflict') return `<h2 class="sheet__title">У вас есть черновик</h2><p class="sheet__sub">Продолжите его или начните новый план.</p><div class="lib-sheet-actions">${Btn('Продолжить черновик',{a:'builder.resume'})}${Btn('Удалить черновик и продолжить',{kind:'soft',a:'builder.replaceDraft'})}</div>`;
    return '';
  }
  function setView(patch) { Store.set({libraryView:{...view(),...patch}}); }
  function input(event) {
    const el=event.target;
    if (el.matches('[data-library-query]')) { Store.silent({libraryView:{...view(),query:el.value}}); document.getElementById('library-results').innerHTML=results(); return true; }
    if (el.matches('[data-picker-query]')) { pickerQuery=el.value; document.getElementById('builder-picker-results').innerHTML=pickerResults(); return true; }
    if (el.matches('[data-builder-field], [data-builder-ex]') && draft) {
      if (el.dataset.builderField) draft[el.dataset.builderField]=el.value;
      else if (draft.exercises[Number(el.dataset.builderEx)]) draft.exercises[Number(el.dataset.builderEx)][el.dataset.builderKey]=el.value;
      persistDraft();
      const status=document.getElementById('builder-storage'); if(status) status.textContent=draftError || 'Черновик сохранён на этом устройстве.';
      const total=document.getElementById('builder-total'); if(total) total.textContent=`${draft.exercises.reduce((n,e)=>n+(Number(e.sets)||0),0)} подходов в плане`;
      if (el.dataset.builderKey==='unit') Store.commit();
      return true;
    }
    return false;
  }
  const actions = {
    'lib.tab':d=>setView({...defaults,tab:d.id}),
    'lib.group':d=>setView({group:d.value}),
    'lib.toggle':d=>setView({[d.key]:!view()[d.key]}),
    'lib.reset':()=>setView({...defaults,tab:view().tab}),
    'lib.favorite':d=>{if(TemplateRepository.toggleFavorite(d.name)) Store.commit(); else Store.ui.toast('warn',TemplateRepository.error());},
    'lib.use':d=>{const t=DB.templates.find(t=>t.id===d.id);if(!t)return;Store.silent({newSession:{...Store.get().newSession,step:0,program:t.program,programLater:false}});Store.nav.go('t-new');},
    'builder.new':()=>begin(), 'builder.edit':d=>begin(d.id), 'builder.copy':d=>begin(d.id,true), 'builder.resume':resume,
    'builder.replaceDraft':()=>{TemplateRepository.clearDraft();draft=null;const intent=pending;pending=null;begin(intent?.id,intent?.copy,true);},
    'builder.leave':()=>{persistDraft();Store.set({screen:'t-library',sheet:null,libraryView:{...defaults,tab:'templates'}});},
    'builder.discardAsk':()=>Store.ui.openSheet('templateDiscard'),
    'builder.discard':()=>{draft=null;TemplateRepository.clearDraft();Store.set({screen:'t-library',sheet:null,libraryView:{...defaults,tab:'templates'}});},
    'builder.pick':()=>{pickerQuery='';Store.ui.openSheet('templatePicker');},
    'builder.select':d=>{const i=draft.exercises.findIndex(e=>e.name===d.name);if(i>=0)draft.exercises.splice(i,1);else{const e=Store.logging.library().find(e=>e.name===d.name);if(!e)return;if(draft.exercises.length>=50){Store.ui.toast('warn','До 50 упражнений в одном шаблоне');return;}draft.exercises.push({name:e.name,sets:'3',reps:e.unit==='сек'?'30':'10',unit:e.unit||'повт',target:'',rest:'90'});}persistDraft();Store.commit();},
    'builder.remove':d=>{draft.exercises.splice(Number(d.index),1);persistDraft();Store.commit();},
    'builder.move':d=>{const i=Number(d.index),to=i+Number(d.delta);if(i<0||i>=draft.exercises.length||to<0||to>=draft.exercises.length)return;[draft.exercises[i],draft.exercises[to]]=[draft.exercises[to],draft.exercises[i]];persistDraft();Store.commit();},
    'builder.save':()=>{if(Store.get().role!=='trainer'||!draft)return;const result=TemplateRepository.save(draft);if(result.error){error=result.error;Store.commit();if(typeof document!=='undefined'){const field=result.field==='name'?document.getElementById('template-name'):document.querySelector(`[data-builder-ex="${result.exercise}"]`);(field||document.getElementById('builder-error'))?.scrollIntoView?.({block:'center'});field?.focus?.();}return;}draft=null;error='';draftError='';Store.set({selectedTemplate:result.id,screen:'t-template',stack:['t-library'],sheet:null,libraryView:{...defaults,tab:'templates'}});Store.ui.toast('','Шаблон сохранён');},
  };
  function change(event) { if(event.target.matches('[data-library-equipment]'))setView({equipment:event.target.value}); }
  return { screen, details, editor, sheet, input, change, actions, filtered, equipment };
})();
