(() => {
  'use strict';

  const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const SLOT_DEFS = {
    compras_tiny_nfe: { title: 'NFE', path: ['Compras', 'Tiny', 'NFE'] },
    compras_tiny_nfce: { title: 'NFC', path: ['Compras', 'Tiny', 'NFC'] },
    compras_tiny_nsa: { title: 'Arquivos', path: ['Compras', 'Tiny'] },
    compras_ml: { title: 'Arquivos', path: ['Compras', 'Mercado Livre'] },
    vendas_tiny: { title: 'Arquivos', path: ['Vendas', 'Tiny'] },
    vendas_ml: { title: 'Arquivos', path: ['Vendas', 'Mercado Livre'] }
  };

  const state = {
    company: 'DNSA',
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    slots: new Map(),
    zipBlobUrl: null,
    zipBlob: null,
    generatedName: ''
  };

  const els = {
    company: document.getElementById('company-select'),
    month: document.getElementById('month-select'),
    year: document.getElementById('year-input'),
    namePreview: document.getElementById('zip-name-preview'),
    treeRootName: document.getElementById('tree-root-name'),
    comprasTinySlots: document.getElementById('compras-tiny-slots'),
    totalFiles: document.getElementById('total-files'),
    totalSize: document.getElementById('total-size'),
    clearAll: document.getElementById('clear-all-btn'),
    generate: document.getElementById('generate-btn'),
    download: document.getElementById('download-btn'),
    buildStatus: document.getElementById('build-status'),
    progressWrap: document.getElementById('progress-wrap'),
    progressLabel: document.getElementById('progress-label'),
    progressPercent: document.getElementById('progress-percent'),
    progressBar: document.getElementById('progress-bar'),
    progressTrack: document.querySelector('.progress-track'),
    message: document.getElementById('message-box'),
    template: document.getElementById('drop-slot-template')
  };

  function init() {
    MONTHS.forEach((name, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = name;
      els.month.appendChild(option);
    });

    els.company.value = state.company;
    els.month.value = String(state.month);
    els.year.value = String(state.year);

    renderDynamicSlots();
    bindStaticEvents();
    refreshUI();
  }

  function bindStaticEvents() {
    els.company.addEventListener('change', () => {
      const previousCompany = state.company;
      state.company = els.company.value;

      // Preserve Tiny/Compras files when switching company in the most intuitive way possible.
      if (previousCompany === 'DNSA' && state.company === 'NSA') {
        const merged = [
          ...(state.slots.get('compras_tiny_nfe') || []),
          ...(state.slots.get('compras_tiny_nfce') || [])
        ];
        if (merged.length && !(state.slots.get('compras_tiny_nsa') || []).length) {
          state.slots.set('compras_tiny_nsa', dedupeFiles(merged));
        }
      }

      invalidateGeneratedZip();
      renderDynamicSlots();
      refreshUI();
    });

    els.month.addEventListener('change', () => {
      state.month = clampNumber(Number(els.month.value), 0, 11, new Date().getMonth());
      invalidateGeneratedZip();
      refreshUI();
    });

    els.year.addEventListener('input', () => {
      const raw = Number(els.year.value);
      if (Number.isFinite(raw)) state.year = Math.round(raw);
      invalidateGeneratedZip();
      refreshUI();
    });

    els.year.addEventListener('blur', () => {
      state.year = clampNumber(state.year, 2000, 2100, new Date().getFullYear());
      els.year.value = String(state.year);
      refreshUI();
    });

    els.clearAll.addEventListener('click', () => {
      const hasFiles = getActiveSlotIds().some(id => (state.slots.get(id) || []).length > 0);
      if (!hasFiles) {
        showMessage('Não há arquivos para limpar.', '');
        return;
      }
      state.slots.clear();
      invalidateGeneratedZip();
      renderDynamicSlots();
      refreshUI();
      showMessage('Todos os arquivos foram removidos.', '');
    });

    els.generate.addEventListener('click', generateZip);

    els.download.addEventListener('click', () => {
      if (!state.zipBlobUrl || !state.zipBlob) return;
      const a = document.createElement('a');
      a.href = state.zipBlobUrl;
      a.download = `${state.generatedName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function renderDynamicSlots() {
    els.comprasTinySlots.innerHTML = '';

    const tinySlots = state.company === 'DNSA'
      ? ['compras_tiny_nfe', 'compras_tiny_nfce']
      : ['compras_tiny_nsa'];

    tinySlots.forEach(id => {
      const holder = document.createElement('div');
      holder.className = 'drop-slot';
      holder.dataset.slot = id;
      els.comprasTinySlots.appendChild(holder);
    });

    document.querySelectorAll('.drop-slot').forEach(mountDropSlot);
  }

  function mountDropSlot(holder) {
    const slotId = holder.dataset.slot;
    const def = SLOT_DEFS[slotId];
    if (!def) return;

    const node = els.template.content.firstElementChild.cloneNode(true);
    const input = node.querySelector('.file-input');
    const folderInput = node.querySelector('.folder-input');
    const selectBtn = node.querySelector('.select-files-btn');
    const selectFolderBtn = node.querySelector('.select-folder-btn');
    const clearBtn = node.querySelector('.clear-slot-btn');

    node.dataset.slot = slotId;
    node.querySelector('.slot-title').textContent = def.title;
    node.querySelector('.slot-path').textContent = def.path.join(' / ');

    const chooseFiles = () => input.click();
    const chooseFolder = () => folderInput.click();

    node.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === node) {
        event.preventDefault();
        chooseFiles();
      }
    });

    selectBtn.addEventListener('click', event => {
      event.stopPropagation();
      chooseFiles();
    });

    selectFolderBtn.addEventListener('click', event => {
      event.stopPropagation();
      chooseFolder();
    });

    clearBtn.addEventListener('click', event => {
      event.stopPropagation();
      state.slots.set(slotId, []);
      invalidateGeneratedZip();
      updateSlotUI(node, slotId);
      refreshTotals();
    });

    input.addEventListener('change', () => {
      const entries = Array.from(input.files || []).map(file => ({ file, relativePath: sanitizeRelativePath(file.name) }));
      addFilesToSlot(slotId, entries);
      input.value = '';
      updateSlotUI(node, slotId);
    });

    folderInput.addEventListener('change', () => {
      const entries = Array.from(folderInput.files || []).map(file => ({ file, relativePath: sanitizeRelativePath(file.webkitRelativePath || file.name) }));
      addFilesToSlot(slotId, entries);
      folderInput.value = '';
      updateSlotUI(node, slotId);
    });

    ['dragenter', 'dragover'].forEach(type => {
      node.addEventListener(type, event => {
        event.preventDefault();
        event.stopPropagation();
        node.classList.add('is-dragging');
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      });
    });

    ['dragleave', 'dragend'].forEach(type => {
      node.addEventListener(type, event => {
        event.preventDefault();
        event.stopPropagation();
        node.classList.remove('is-dragging');
      });
    });

    node.addEventListener('drop', async event => {
      event.preventDefault();
      event.stopPropagation();
      node.classList.remove('is-dragging');

      try {
        setSlotBusy(node, true);
        const entries = await extractDroppedFiles(event.dataTransfer);
        addFilesToSlot(slotId, entries);
      } catch (error) {
        console.error(error);
        showMessage('Não foi possível ler um ou mais itens arrastados. Tente usar “Selecionar arquivos”.', 'error');
      } finally {
        setSlotBusy(node, false);
        updateSlotUI(node, slotId);
      }
    });

    holder.replaceWith(node);
    updateSlotUI(node, slotId);
  }

  function setSlotBusy(node, busy) {
    node.setAttribute('aria-busy', busy ? 'true' : 'false');
    const button = node.querySelector('.select-files-btn');
    const folderButton = node.querySelector('.select-folder-btn');
    button.disabled = busy;
    folderButton.disabled = busy;
    button.textContent = busy ? 'Lendo arquivos…' : 'Selecionar arquivos';
  }

  function addFilesToSlot(slotId, entries) {
    const current = state.slots.get(slotId) || [];
    const valid = entries.filter(item => item && item.file instanceof File && item.file.size >= 0);
    state.slots.set(slotId, dedupeFiles([...current, ...valid]));
    invalidateGeneratedZip();
    refreshTotals();
    hideMessage();
  }

  function dedupeFiles(items) {
    const map = new Map();
    items.forEach(item => {
      const path = sanitizeRelativePath(item.relativePath || item.file.name);
      const key = `${path}::${item.file.size}::${item.file.lastModified}`;
      map.set(key, { file: item.file, relativePath: path });
    });
    return Array.from(map.values());
  }

  async function extractDroppedFiles(dataTransfer) {
    if (!dataTransfer) return [];

    const items = Array.from(dataTransfer.items || []);
    const supportsEntries = items.some(item => typeof item.webkitGetAsEntry === 'function');

    if (supportsEntries) {
      const output = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          const nested = await readEntry(entry, '');
          output.push(...nested);
        }
      }
      if (output.length) return output;
    }

    return Array.from(dataTransfer.files || []).map(file => ({
      file,
      relativePath: sanitizeRelativePath(file.webkitRelativePath || file.name)
    }));
  }

  async function readEntry(entry, parentPath) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      return [{ file, relativePath: sanitizeRelativePath(`${parentPath}${file.name}`) }];
    }

    if (entry.isDirectory) {
      const nextParent = `${parentPath}${entry.name}/`;
      const reader = entry.createReader();
      const children = [];
      let batch = [];
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        children.push(...batch);
      } while (batch.length > 0);

      const nestedResults = await Promise.all(children.map(child => readEntry(child, nextParent)));
      return nestedResults.flat();
    }

    return [];
  }

  function updateSlotUI(node, slotId) {
    const items = state.slots.get(slotId) || [];
    const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

    node.classList.toggle('has-files', items.length > 0);
    node.querySelector('.slot-count').textContent = `${items.length} ${items.length === 1 ? 'arquivo' : 'arquivos'}`;
    node.querySelector('.slot-size').textContent = formatBytes(totalBytes);
    node.querySelector('.clear-slot-btn').disabled = items.length === 0;

    const list = node.querySelector('.file-list');
    list.innerHTML = '';

    const maxVisible = 6;
    items.slice(0, maxVisible).forEach(item => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      const size = document.createElement('span');
      name.className = 'file-name';
      size.className = 'file-size';
      name.textContent = item.relativePath;
      name.title = item.relativePath;
      size.textContent = formatBytes(item.file.size);
      li.append(name, size);
      list.appendChild(li);
    });

    if (items.length > maxVisible) {
      const li = document.createElement('li');
      const more = document.createElement('span');
      more.className = 'file-name';
      more.textContent = `+ ${items.length - maxVisible} arquivo(s)`;
      li.appendChild(more);
      list.appendChild(li);
    }
  }

  function refreshUI() {
    const rootName = getRootName();
    els.namePreview.textContent = `${rootName}.zip`;
    els.treeRootName.textContent = rootName;
    refreshAllSlots();
    refreshTotals();
  }

  function refreshAllSlots() {
    document.querySelectorAll('.dropzone[data-slot]').forEach(node => {
      updateSlotUI(node, node.dataset.slot);
    });
  }

  function refreshTotals() {
    const ids = getActiveSlotIds();
    const all = ids.flatMap(id => state.slots.get(id) || []);
    const totalSize = all.reduce((sum, item) => sum + item.file.size, 0);
    els.totalFiles.textContent = String(all.length);
    els.totalSize.textContent = formatBytes(totalSize);
  }

  function getActiveSlotIds() {
    return state.company === 'DNSA'
      ? ['compras_tiny_nfe', 'compras_tiny_nfce', 'compras_ml', 'vendas_tiny', 'vendas_ml']
      : ['compras_tiny_nsa', 'compras_ml', 'vendas_tiny', 'vendas_ml'];
  }

  function getRootName() {
    const monthName = MONTHS[clampNumber(state.month, 0, 11, 0)];
    const safeYear = clampNumber(state.year, 2000, 2100, new Date().getFullYear());
    return `Movimento Fiscal (${state.company}) (${monthName}) de (${safeYear})`;
  }

  async function generateZip() {
    const year = clampNumber(Number(els.year.value), 2000, 2100, NaN);
    if (!Number.isFinite(year)) {
      showMessage('Informe um ano válido entre 2000 e 2100.', 'error');
      els.year.focus();
      return;
    }
    state.year = year;
    els.year.value = String(year);

    const activeSlotIds = getActiveSlotIds();
    const fileCount = activeSlotIds.reduce((sum, id) => sum + (state.slots.get(id) || []).length, 0);

    if (fileCount === 0) {
      showMessage('Adicione pelo menos um arquivo antes de gerar o ZIP.', 'error');
      return;
    }

    const entries = collectZipEntries();
    const maxZip32 = 0xFFFFFFFF;
    const tooLargeFile = entries.find(entry => !entry.isDirectory && entry.file.size >= maxZip32);
    const totalInput = entries.reduce((sum, entry) => sum + (entry.isDirectory ? 0 : entry.file.size), 0);

    if (tooLargeFile || totalInput >= maxZip32) {
      showMessage('Este gerador usa o formato ZIP padrão (ZIP32). Mantenha cada arquivo e o total do pacote abaixo de aproximadamente 4 GB.', 'error');
      return;
    }

    els.generate.disabled = true;
    els.download.disabled = true;
    els.clearAll.disabled = true;
    els.company.disabled = true;
    els.month.disabled = true;
    els.year.disabled = true;
    els.progressWrap.hidden = false;
    updateProgress(0, 'Preparando estrutura…');
    els.buildStatus.textContent = 'Gerando ZIP…';
    hideMessage();

    try {
      const rootName = getRootName();
      const blob = await buildZipBlob(entries, (percent, label) => updateProgress(percent, label));

      if (state.zipBlobUrl) URL.revokeObjectURL(state.zipBlobUrl);
      state.zipBlob = blob;
      state.zipBlobUrl = URL.createObjectURL(blob);
      state.generatedName = rootName;

      updateProgress(100, 'ZIP concluído');
      els.download.disabled = false;
      els.buildStatus.textContent = 'ZIP pronto para download';
      showMessage(`ZIP gerado com sucesso: ${rootName}.zip (${formatBytes(blob.size)}).`, 'success');
    } catch (error) {
      console.error(error);
      els.buildStatus.textContent = 'Falha ao gerar';
      showMessage(`Erro ao gerar o ZIP: ${error?.message || 'erro desconhecido'}.`, 'error');
      invalidateGeneratedZip();
    } finally {
      els.generate.disabled = false;
      els.clearAll.disabled = false;
      els.company.disabled = false;
      els.month.disabled = false;
      els.year.disabled = false;
    }
  }

  function collectZipEntries() {
    const rootName = getRootName();
    const activeSlotIds = getActiveSlotIds();
    const folderPaths = state.company === 'DNSA'
      ? [
          ['Compras'],
          ['Compras', 'Tiny'],
          ['Compras', 'Tiny', 'NFE'],
          ['Compras', 'Tiny', 'NFC'],
          ['Compras', 'Mercado Livre'],
          ['Vendas'],
          ['Vendas', 'Tiny'],
          ['Vendas', 'Mercado Livre']
        ]
      : [
          ['Compras'],
          ['Compras', 'Tiny'],
          ['Compras', 'Mercado Livre'],
          ['Vendas'],
          ['Vendas', 'Tiny'],
          ['Vendas', 'Mercado Livre']
        ];

    const entries = [{ name: `${rootName}/`, isDirectory: true, date: new Date() }];
    folderPaths.forEach(parts => {
      entries.push({ name: `${rootName}/${parts.join('/')}/`, isDirectory: true, date: new Date() });
    });

    const usedNames = new Set(entries.map(entry => entry.name.toLocaleLowerCase('pt-BR')));

    activeSlotIds.forEach(slotId => {
      const def = SLOT_DEFS[slotId];
      const items = state.slots.get(slotId) || [];
      items.forEach(item => {
        const base = `${rootName}/${def.path.join('/')}/${sanitizeRelativePath(item.relativePath || item.file.name)}`;
        const uniqueName = makeUniqueZipPath(base, usedNames);
        usedNames.add(uniqueName.toLocaleLowerCase('pt-BR'));
        entries.push({
          name: uniqueName,
          isDirectory: false,
          file: item.file,
          date: item.file.lastModified ? new Date(item.file.lastModified) : new Date()
        });
      });
    });

    return entries;
  }

  function makeUniqueZipPath(path, usedNames) {
    if (!usedNames.has(path.toLocaleLowerCase('pt-BR'))) return path;

    const slash = path.lastIndexOf('/');
    const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
    const fileName = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = fileName.lastIndexOf('.');
    const hasExtension = dot > 0;
    const stem = hasExtension ? fileName.slice(0, dot) : fileName;
    const ext = hasExtension ? fileName.slice(dot) : '';

    let index = 2;
    let candidate;
    do {
      candidate = `${dir}${stem} (${index})${ext}`;
      index += 1;
    } while (usedNames.has(candidate.toLocaleLowerCase('pt-BR')));

    return candidate;
  }

  async function buildZipBlob(entries, onProgress) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const records = [];
    const files = entries.filter(entry => !entry.isDirectory);
    const totalBytes = files.reduce((sum, entry) => sum + entry.file.size, 0);
    let bytesScanned = 0;

    // First pass: calculate CRC-32 incrementally, keeping memory usage low.
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const nameBytes = encoder.encode(entry.name);
      let crc = 0;
      let size = 0;

      if (!entry.isDirectory) {
        size = entry.file.size;
        crc = await crc32File(entry.file, chunkSize => {
          bytesScanned += chunkSize;
          const scanProgress = totalBytes > 0 ? (bytesScanned / totalBytes) * 65 : 65;
          onProgress(scanProgress, `Lendo: ${entry.file.name}`);
        });
      }

      records.push({ ...entry, nameBytes, crc, size });
    }

    // Second pass: assemble ZIP local headers and original File/Blob objects.
    let offset = 0;
    records.forEach((record, index) => {
      const { dosTime, dosDate } = toDosDateTime(record.date);
      const flags = 0x0800; // UTF-8 file names.
      const method = 0; // STORE: no compression; reliable and dependency-free.
      const externalAttributes = record.isDirectory ? 0x10 : 0;
      const localHeader = makeLocalHeader(record, flags, method, dosTime, dosDate);

      localParts.push(localHeader);
      if (!record.isDirectory) localParts.push(record.file);

      centralParts.push(makeCentralHeader(record, flags, method, dosTime, dosDate, offset, externalAttributes));
      offset += localHeader.byteLength + record.size;

      const assembleProgress = 65 + ((index + 1) / Math.max(records.length, 1)) * 30;
      onProgress(assembleProgress, record.isDirectory ? 'Montando pastas…' : `Adicionando: ${record.file.name}`);
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
    const endRecord = makeEndOfCentralDirectory(records.length, centralSize, centralOffset);

    onProgress(98, 'Finalizando ZIP…');
    await yieldToBrowser();

    return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
  }

  function makeLocalHeader(record, flags, method, dosTime, dosDate) {
    const buffer = new ArrayBuffer(30 + record.nameBytes.length);
    const view = new DataView(buffer);
    let o = 0;
    o = writeU32(view, o, 0x04034b50);
    o = writeU16(view, o, 20);
    o = writeU16(view, o, flags);
    o = writeU16(view, o, method);
    o = writeU16(view, o, dosTime);
    o = writeU16(view, o, dosDate);
    o = writeU32(view, o, record.crc >>> 0);
    o = writeU32(view, o, record.size >>> 0);
    o = writeU32(view, o, record.size >>> 0);
    o = writeU16(view, o, record.nameBytes.length);
    o = writeU16(view, o, 0);
    new Uint8Array(buffer, o).set(record.nameBytes);
    return new Uint8Array(buffer);
  }

  function makeCentralHeader(record, flags, method, dosTime, dosDate, localOffset, externalAttributes) {
    const buffer = new ArrayBuffer(46 + record.nameBytes.length);
    const view = new DataView(buffer);
    let o = 0;
    o = writeU32(view, o, 0x02014b50);
    o = writeU16(view, o, 20);
    o = writeU16(view, o, 20);
    o = writeU16(view, o, flags);
    o = writeU16(view, o, method);
    o = writeU16(view, o, dosTime);
    o = writeU16(view, o, dosDate);
    o = writeU32(view, o, record.crc >>> 0);
    o = writeU32(view, o, record.size >>> 0);
    o = writeU32(view, o, record.size >>> 0);
    o = writeU16(view, o, record.nameBytes.length);
    o = writeU16(view, o, 0);
    o = writeU16(view, o, 0);
    o = writeU16(view, o, 0);
    o = writeU16(view, o, 0);
    o = writeU32(view, o, externalAttributes >>> 0);
    o = writeU32(view, o, localOffset >>> 0);
    new Uint8Array(buffer, o).set(record.nameBytes);
    return new Uint8Array(buffer);
  }

  function makeEndOfCentralDirectory(entryCount, centralSize, centralOffset) {
    const buffer = new ArrayBuffer(22);
    const view = new DataView(buffer);
    let o = 0;
    o = writeU32(view, o, 0x06054b50);
    o = writeU16(view, o, 0);
    o = writeU16(view, o, 0);
    o = writeU16(view, o, entryCount);
    o = writeU16(view, o, entryCount);
    o = writeU32(view, o, centralSize >>> 0);
    o = writeU32(view, o, centralOffset >>> 0);
    writeU16(view, o, 0);
    return new Uint8Array(buffer);
  }

  function writeU16(view, offset, value) {
    view.setUint16(offset, value & 0xFFFF, true);
    return offset + 2;
  }

  function writeU32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
    return offset + 4;
  }

  function toDosDateTime(date) {
    const safeDate = date instanceof Date && !Number.isNaN(date.valueOf()) ? date : new Date();
    const year = Math.max(1980, Math.min(2107, safeDate.getFullYear()));
    const month = safeDate.getMonth() + 1;
    const day = safeDate.getDate();
    const hours = safeDate.getHours();
    const minutes = safeDate.getMinutes();
    const seconds = Math.floor(safeDate.getSeconds() / 2);

    return {
      dosTime: (hours << 11) | (minutes << 5) | seconds,
      dosDate: ((year - 1980) << 9) | (month << 5) | day
    };
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  async function crc32File(file, onChunk) {
    let crc = 0xFFFFFFFF;

    if (file.stream && typeof file.stream === 'function') {
      const reader = file.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          crc = crc32Update(crc, value);
          onChunk(value.byteLength);
          await yieldToBrowser();
        }
      } finally {
        reader.releaseLock?.();
      }
    } else {
      const chunkSize = 2 * 1024 * 1024;
      for (let start = 0; start < file.size; start += chunkSize) {
        const chunk = new Uint8Array(await file.slice(start, start + chunkSize).arrayBuffer());
        crc = crc32Update(crc, chunk);
        onChunk(chunk.byteLength);
        await yieldToBrowser();
      }
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function crc32Update(crc, bytes) {
    let current = crc >>> 0;
    for (let i = 0; i < bytes.length; i += 1) {
      current = CRC32_TABLE[(current ^ bytes[i]) & 0xFF] ^ (current >>> 8);
    }
    return current >>> 0;
  }

  function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function updateProgress(value, label) {
    const rounded = Math.round(value);
    els.progressBar.style.width = `${rounded}%`;
    els.progressPercent.textContent = `${rounded}%`;
    els.progressLabel.textContent = label;
    els.progressTrack.setAttribute('aria-valuenow', String(rounded));
  }

  function invalidateGeneratedZip() {
    if (state.zipBlobUrl) {
      URL.revokeObjectURL(state.zipBlobUrl);
      state.zipBlobUrl = null;
    }
    state.zipBlob = null;
    state.generatedName = '';
    els.download.disabled = true;
    els.buildStatus.textContent = 'Pronto para gerar';
    els.progressWrap.hidden = true;
    updateProgress(0, 'Preparando arquivos…');
  }

  function showMessage(text, type) {
    els.message.textContent = text;
    els.message.className = 'message-box';
    if (type) els.message.classList.add(type);
    els.message.hidden = false;
  }

  function hideMessage() {
    els.message.hidden = true;
    els.message.textContent = '';
    els.message.className = 'message-box';
  }

  function sanitizeRelativePath(path) {
    return String(path || 'arquivo')
      .replace(/\\/g, '/')
      .split('/')
      .filter(part => part && part !== '.' && part !== '..')
      .map(part => sanitizeFilename(part))
      .join('/');
  }

  function sanitizeFilename(name) {
    return String(name || 'arquivo')
      .replace(/[<>:"|?*\u0000-\u001F]/g, '_')
      .trim() || 'arquivo';
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: index === 0 ? 0 : 1 })} ${units[index]}`;
  }

  function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  window.addEventListener('beforeunload', () => {
    if (state.zipBlobUrl) URL.revokeObjectURL(state.zipBlobUrl);
  });

  init();
})();
