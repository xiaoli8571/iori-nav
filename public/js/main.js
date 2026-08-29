document.addEventListener('DOMContentLoaded', function () {
  // ========== 侧边栏控制 ==========
  const sidebar = document.getElementById('sidebar');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const closeSidebar = document.getElementById('closeSidebar');

  function openSidebar() {
    sidebar?.classList.add('open');
    mobileOverlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebarMenu() {
    sidebar?.classList.remove('open');
    mobileOverlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  sidebarToggle?.addEventListener('click', openSidebar);
  closeSidebar?.addEventListener('click', closeSidebarMenu);
  mobileOverlay?.addEventListener('click', closeSidebarMenu);

  // 为初始 SSR 渲染的卡片设置动画延迟（已从服务端移至前端）
  const initialCards = document.querySelectorAll('.site-card.card-anim-enter');
  const sitesGrid = document.getElementById('sitesGrid');

  // 毛玻璃开关在整个页面生命周期内不变：IORI_LAYOUT_CONFIG 为主，CSS 变量做回退。
  // 只在启动时读一次，避免 renderSites 每次切分类都触发 getComputedStyle
  const isFrostedEnabled = (() => {
    const config = window.IORI_LAYOUT_CONFIG || {};
    if (config.enableFrostedGlass !== undefined) return config.enableFrostedGlass;
    const frostedBlurVal = getComputedStyle(document.documentElement)
      .getPropertyValue('--frosted-glass-blur').trim();
    return frostedBlurVal !== '';
  })();

  initialCards.forEach((card, index) => {
    const delay = Math.min(index, 12) * 20;
    if (delay > 0) card.style.animationDelay = `${delay}ms`;
    card.addEventListener('animationend', () => {
      card.classList.remove('card-anim-enter');
      if (card.style.animationDelay) {
        card.style.removeProperty('animation-delay');
      }
    }, { once: true });
  });

  // ========== 复制链接 & 常用收藏（卡片事件委托） ==========
  sitesGrid?.addEventListener('click', function (e) {
    // 星标切换：写入 localStorage，纯本地常用收藏，无需后端
    const favBtn = e.target.closest('.fav-btn');
    if (favBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = favBtn.getAttribute('data-fav-id');
      if (!id) return;
      const nowFaved = toggleFavorite(id);
      applyFavoriteStates();
      showToast(nowFaved ? '已加入常用' : '已取消常用');
      return;
    }

    const btn = e.target.closest('.copy-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();
    const url = btn.getAttribute('data-url');
    if (!url) return;

    navigator.clipboard.writeText(url).then(() => {
      showCopySuccess(btn);
    }).catch(() => {
      // 备用方法
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showCopySuccess(btn);
      } catch (err) {
        alert('复制失败,请手动复制');
      }
      document.body.removeChild(textarea);
    });
  });

  function showCopySuccess(btn) {
    const successMsg = btn.querySelector('.copy-success');
    if (!successMsg) return;
    successMsg.classList.remove('hidden');
    successMsg.classList.add('copy-success-animation');
    setTimeout(() => {
      successMsg.classList.add('hidden');
      successMsg.classList.remove('copy-success-animation');
    }, 2000);
  }

  // ========== 返回顶部 ==========
  const backToTop = document.getElementById('backToTop');
  const appScroll = document.getElementById('app-scroll');

  let scrollTicking = false;
  const onScroll = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      const top = appScroll ? appScroll.scrollTop : window.pageYOffset;
      if (top > 300) {
        backToTop?.classList.remove('opacity-0', 'invisible');
      } else {
        backToTop?.classList.add('opacity-0', 'invisible');
      }
      // 返回顶部按钮的滚动进度环（CSS conic-gradient 消费 --scroll-progress）
      if (backToTop) {
        const max = appScroll
          ? appScroll.scrollHeight - appScroll.clientHeight
          : document.documentElement.scrollHeight - window.innerHeight;
        const pct = max > 0 ? Math.min(100, (top / max) * 100) : 0;
        backToTop.style.setProperty('--scroll-progress', pct.toFixed(2));
        backToTop.classList.toggle('progress-live', pct > 2);
      }
      scrollTicking = false;
    });
  };

  if (appScroll) {
    appScroll.addEventListener('scroll', onScroll);
  } else {
    window.addEventListener('scroll', onScroll);
  }

  backToTop?.addEventListener('click', function () {
    if (appScroll) {
      appScroll.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ========== 模态框控制 ==========
  const addSiteModal = document.getElementById('addSiteModal');
  const addSiteBtnSidebar = document.getElementById('addSiteBtnSidebar');
  const addSiteBtnHorizontal = document.getElementById('addSiteBtnHorizontal');
  const closeModalBtn = document.getElementById('closeModal');
  const cancelAddSite = document.getElementById('cancelAddSite');
  const addSiteForm = document.getElementById('addSiteForm');

  function openModal() {
    addSiteModal?.classList.remove('opacity-0', 'invisible');
    addSiteModal?.querySelector('.max-w-md')?.classList.remove('translate-y-8');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    addSiteModal?.classList.add('opacity-0', 'invisible');
    addSiteModal?.querySelector('.max-w-md')?.classList.add('translate-y-8');
    document.body.style.overflow = '';
  }

  let cachedCategories = null;

  function buildCategoryTree(categories) {
    const map = new Map();
    const roots = [];

    categories.forEach(category => {
      map.set(category.id, { ...category, children: [] });
    });

    categories.forEach(category => {
      const node = map.get(category.id);
      if (category.parent_id && map.has(category.parent_id)) {
        map.get(category.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (nodes) => {
      nodes.sort((a, b) => {
        const orderA = Number(a.sort_order);
        const orderB = Number(b.sort_order);
        const safeOrderA = Number.isFinite(orderA) ? orderA : 9999;
        const safeOrderB = Number.isFinite(orderB) ? orderB : 9999;
        return safeOrderA - safeOrderB || a.id - b.id;
      });
      nodes.forEach(node => sortNodes(node.children));
    };
    sortNodes(roots);

    return roots;
  }

  function flattenCategoryOptions(nodes, depth = 0, options = []) {
    nodes.forEach(node => {
      const prefix = depth > 0 ? `${'　'.repeat(depth)}└─ ` : '';
      options.push({ id: node.id, label: `${prefix}${node.catelog}` });
      if (node.children?.length) flattenCategoryOptions(node.children, depth + 1, options);
    });
    return options;
  }

  function renderCategoryOptions(selectElement, categoryOptions) {
    selectElement.innerHTML = '<option value="" disabled selected>请选择一个分类</option>';
    if (categoryOptions.length === 0) {
      selectElement.innerHTML = '<option value="" disabled>暂无可投稿分类</option>';
      return;
    }

    categoryOptions.forEach(category => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.label;
      selectElement.appendChild(option);
    });
  }

  async function fetchCategoriesForSelect() {
    const selectElement = document.getElementById('addSiteCatelog');
    if (!selectElement) return;

    if (cachedCategories) {
      renderCategoryOptions(selectElement, cachedCategories);
      return;
    }

    try {
      const response = await fetch('/api/categories?scope=public&pageSize=1000');
      const data = await response.json();
      if (data.code === 200 && data.data) {
        cachedCategories = flattenCategoryOptions(buildCategoryTree(data.data));
        renderCategoryOptions(selectElement, cachedCategories);
      } else {
        selectElement.innerHTML = '<option value="" disabled>无法加载分类</option>';
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      selectElement.innerHTML = '<option value="" disabled>加载分类失败</option>';
    }
  }

  [addSiteBtnSidebar, addSiteBtnHorizontal].forEach(btn => btn?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
    fetchCategoriesForSelect();
  }));

  closeModalBtn?.addEventListener('click', closeModal);
  cancelAddSite?.addEventListener('click', closeModal);
  addSiteModal?.addEventListener('click', (e) => {
    if (e.target === addSiteModal) closeModal();
  });

  // ========== 表单提交 ==========
  addSiteForm?.addEventListener('submit', function (e) {
    e.preventDefault();

    const data = {
      name: document.getElementById('addSiteName').value,
      url: document.getElementById('addSiteUrl').value,
      logo: document.getElementById('addSiteLogo').value,
      desc: document.getElementById('addSiteDesc').value,
      catelog_id: document.getElementById('addSiteCatelog').value
    };

    fetch('/api/config/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(res => res.json())
      .then(data => {
        if (data.code === 201) {
          showToast('提交成功,等待管理员审核');
          closeModal();
          addSiteForm.reset();
        } else {
          alert(data.message || '提交失败');
        }
      })
      .catch(err => {
        console.error('网络错误:', err);
        alert('网络错误,请稍后重试');
      });
  });

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 bg-accent-500 text-white px-4 py-2 rounded shadow-lg z-50 transition-opacity duration-300';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ========== 搜索功能 ==========
  const searchInputs = document.querySelectorAll('.search-input-target');

  // 预缓存卡片搜索数据：从 IORI_SITES 按 data-id 查表，避免把数据再塞进 card 的 data-* 属性
  let searchCardCache = null;
  function getSearchCardCache() {
    if (searchCardCache) return searchCardCache;
    const cards = sitesGrid?.querySelectorAll('.site-card');
    if (!cards) return [];
    const sitesById = new Map();
    (window.IORI_SITES || []).forEach(s => sitesById.set(String(s.id), s));
    searchCardCache = Array.from(cards).map(card => {
      const id = card.getAttribute('data-id');
      const s = sitesById.get(String(id)) || {};
      const text = [s.name, s.url, s.catelog_name || '未分类', s.desc]
        .map(v => (v || '').toLowerCase()).join('\0');
      return { el: card, text, site: s };
    });
    return searchCardCache;
  }

  let searchDebounceTimer = null;

  // Initialize Search Engine UI based on saved preference
  const engineOptions = document.querySelectorAll('.search-engine-option');

  // 如果外部搜索被禁用（没有搜索引擎选项），强制使用本地搜索
  let currentSearchEngine = 'local';
  if (engineOptions.length > 0) {
    currentSearchEngine = localStorage.getItem('search_engine') || 'local';
    if (currentSearchEngine === 'bing') {
      currentSearchEngine = 'github';
      localStorage.setItem('search_engine', currentSearchEngine);
    }
  } else {
    // 清除之前保存的外部搜索引擎选择
    localStorage.removeItem('search_engine');
  }

  function updateSearchEngineUI(engine) {
    // Update Active Class
    engineOptions.forEach(opt => {
      if (opt.dataset.engine === engine) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    // Update Placeholder
    let placeholder = '搜索书签...';
    switch (engine) {
      case 'google': placeholder = 'Google 搜索...'; break;
      case 'baidu': placeholder = '百度搜索...'; break;
      case 'github': placeholder = 'GitHub 搜索...'; break;
    }

    searchInputs.forEach(input => {
      input.placeholder = placeholder;
      // If switching back to local, trigger filter immediately if input has value
      if (engine === 'local' && input.value.trim()) {
        input.dispatchEvent(new Event('input'));
      }
    });
  }

  // Apply initial state
  if (engineOptions.length > 0) {
    updateSearchEngineUI(currentSearchEngine);
  }

  // Search Engine Switching Logic
  engineOptions.forEach(option => {
    option.addEventListener('click', () => {
      currentSearchEngine = option.dataset.engine;
      localStorage.setItem('search_engine', currentSearchEngine); // Save to storage
      updateSearchEngineUI(currentSearchEngine);

      // Focus input after switch
      searchInputs.forEach(input => input.focus());
    });
  });

  searchInputs.forEach(input => {
    // Local Search Input Handler with debounce
    input.addEventListener('input', function () {
      if (currentSearchEngine !== 'local') return;

      const value = this.value;
      // Sync other inputs immediately
      searchInputs.forEach(otherInput => {
        if (otherInput !== this) otherInput.value = value;
      });

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        applyCardFilters(value.toLowerCase().trim());
      }, 200);
    });

    // External Search Enter Handler
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && currentSearchEngine !== 'local') {
        e.preventDefault();
        const query = this.value.trim();
        if (query) {
          let url = '';
          switch (currentSearchEngine) {
            case 'google': url = `https://www.google.com/search?q=${encodeURIComponent(query)}`; break;
            case 'baidu': url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`; break;
            case 'github': url = `https://github.com/search?q=${encodeURIComponent(query)}`; break;
          }
          if (url) window.open(url, '_blank');
        }
      }
    });
  });

  function updateHeading(keyword, activeCatalog, count) {
    const heading = document.querySelector('[data-role="list-heading"]');
    if (!heading) return;

    const visibleCount = (count !== undefined) ? count : (sitesGrid?.querySelectorAll('.site-card:not(.hidden)').length || 0);
    const isMobile = window.innerWidth < 440;

    // Explicitly handle navigation state
    if (activeCatalog !== undefined) {
      if (activeCatalog) {
        heading.dataset.active = activeCatalog;
      } else {
        // Null or empty string means "All Categories"
        delete heading.dataset.active;
      }
    }

    if (keyword) {
      heading.textContent = isMobile ? `${visibleCount} 个书签` : `搜索结果 · ${visibleCount} 个书签`;
    } else {
      const currentActive = heading.dataset.active;
      if (isMobile) {
        heading.textContent = `${visibleCount} 个书签`;
      } else {
        if (currentActive) {
          heading.textContent = `${currentActive} · ${visibleCount} 个书签`;
        } else {
          heading.textContent = `全部收藏 · ${visibleCount} 个书签`;
        }
      }
    }
  }

  // 初次加载时根据屏幕宽度修正标题显示
  updateHeading();

  // ========== 本地过滤统一入口（关键词 + 常用收藏 组合过滤 + 关键词高亮） ==========
  let currentKeyword = '';
  let favOnly = false;

  function applyCardFilters(keyword) {
    currentKeyword = keyword || '';
    const cached = getSearchCardCache();
    let visible = 0;

    cached.forEach(({ el, text, site }) => {
      const matchKeyword = currentKeyword === '' || text.includes(currentKeyword);
      const matchFav = !favOnly || isFavorite(el.getAttribute('data-id'));
      const show = matchKeyword && matchFav;
      el.classList.toggle('hidden', !show);
      if (show) visible++;
      if (currentKeyword && site && site.name) {
        applyHighlight(el, site, currentKeyword);
      } else {
        clearHighlight(el);
      }
    });

    updateHeading(currentKeyword, undefined, visible);
  }

  // --- 关键词高亮：仅重建 title/desc 两个纯文本节点，原文与转义逻辑不变 ---
  function highlightIn(el, rawText, keyword) {
    if (!el) return;
    if (el.dataset.origText === undefined) el.dataset.origText = el.textContent;
    const raw = String(rawText || '');
    const idx = raw.toLowerCase().indexOf(keyword);
    if (idx === -1) {
      el.textContent = el.dataset.origText;
      return;
    }
    el.textContent = '';
    if (idx > 0) el.appendChild(document.createTextNode(raw.slice(0, idx)));
    const mark = document.createElement('mark');
    mark.className = 'search-hit';
    mark.textContent = raw.slice(idx, idx + keyword.length);
    el.appendChild(mark);
    if (idx + keyword.length < raw.length) el.appendChild(document.createTextNode(raw.slice(idx + keyword.length)));
  }

  function applyHighlight(card, site, keyword) {
    highlightIn(card.querySelector('.site-title'), site.name, keyword);
    highlightIn(card.querySelector('p'), site.desc || '', keyword);
  }

  function clearHighlight(card) {
    const els = [card.querySelector('.site-title'), card.querySelector('p')];
    els.forEach(el => {
      if (el && el.dataset.origText !== undefined) {
        el.textContent = el.dataset.origText;
        delete el.dataset.origText;
      }
    });
  }

  // ========== 常用收藏（本地星标，localStorage 存储，无后端依赖） ==========
  const FAV_KEY = 'iori_favorites';
  const favFilterBtn = document.getElementById('favFilterBtn');
  const favCountEl = document.getElementById('favCount');

  function getFavorites() {
    try {
      const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(String) : [];
    } catch {
      return [];
    }
  }

  function saveFavorites(list) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(list));
    } catch { /* 隐私模式等场景下静默失败 */ }
  }

  function isFavorite(id) {
    return getFavorites().includes(String(id));
  }

  function toggleFavorite(id) {
    const list = getFavorites();
    const sid = String(id);
    const idx = list.indexOf(sid);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(sid);
    saveFavorites(list);
    return idx < 0;
  }

  // 将 localStorage 中的星标状态同步到当前 DOM 中的卡片（SSR 与客户端渲染通用）
  function applyFavoriteStates() {
    const favs = new Set(getFavorites());
    sitesGrid?.querySelectorAll('.site-card').forEach(card => {
      const faved = favs.has(card.getAttribute('data-id'));
      card.classList.toggle('faved', faved);
      const btn = card.querySelector('.fav-btn');
      if (btn) {
        btn.classList.toggle('faved', faved);
        btn.setAttribute('aria-pressed', faved ? 'true' : 'false');
        // 切换实心/线性星（sprite symbol）
        const use = btn.querySelector('use');
        if (use) use.setAttribute('href', faved ? '#icon-star-solid' : '#icon-star');
      }
    });
    updateFavChip(favs.size);
  }

  function updateFavChip(count) {
    const n = (count !== undefined) ? count : getFavorites().length;
    if (!favFilterBtn) return;

    if (n > 0) {
      favFilterBtn.classList.remove('hidden');
      favFilterBtn.classList.add('flex');
    } else {
      favFilterBtn.classList.add('hidden');
      favFilterBtn.classList.remove('flex');
      // 最后一个星标被取消时自动退出「只看常用」模式
      if (favOnly) {
        favOnly = false;
        favFilterBtn.setAttribute('aria-pressed', 'false');
        favFilterBtn.classList.remove('fav-filter-active');
        applyCardFilters(currentKeyword);
      }
    }
    if (favCountEl) favCountEl.textContent = n > 0 ? String(n) : '';
  }

  favFilterBtn?.addEventListener('click', () => {
    favOnly = !favOnly;
    favFilterBtn.setAttribute('aria-pressed', favOnly ? 'true' : 'false');
    favFilterBtn.classList.toggle('fav-filter-active', favOnly);
    applyCardFilters(currentKeyword);
  });

  // 初始加载：同步星标状态 + 显示常用入口
  applyFavoriteStates();

  // ========== 一言 API ==========
  const hitokotoContainer = document.querySelector('#hitokoto')?.parentElement;
  // 检查容器是否被隐藏，如果隐藏则不发起请求
  if (hitokotoContainer && !hitokotoContainer.classList.contains('hidden')) {
    const hitokotoEl = document.getElementById('hitokoto');
    fetch('https://v1.hitokoto.cn', { signal: AbortSignal.timeout(3000) })
      .then(res => res.json())
      .then(data => {
        const hitokoto = document.getElementById('hitokoto_text');
        if (hitokoto) {
          hitokoto.href = `https://hitokoto.cn/?uuid=${data.uuid}`;
          hitokoto.innerText = data.hitokoto;
          // 淡入新句子（CSS 过渡）
          hitokotoEl?.classList.remove('hitokoto-loading');
        }
      })
      .catch(() => { hitokotoEl?.classList.remove('hitokoto-loading'); });
    // 先淡出占位文案
    hitokotoEl?.classList.add('hitokoto-loading');
  }

  // ========== Horizontal Menu Overflow Logic ==========
  const navContainer = document.getElementById('horizontalCategoryNav');
  const moreWrapper = document.getElementById('horizontalMoreWrapper');
  const moreBtn = document.getElementById('horizontalMoreBtn');
  const dropdown = document.getElementById('horizontalMoreDropdown');

  // Define these globally within the scope so updateNavigationState can use them
  let checkOverflow = () => { };
  let resetNav = () => { };

  if (navContainer && moreWrapper && moreBtn && dropdown) {
    resetNav = () => {
      const dropdownItems = Array.from(dropdown.children);
      dropdownItems.forEach(item => {
        if (item.dataset.originalClass) item.className = item.dataset.originalClass;
        const link = item.querySelector('a');
        if (link && link.dataset.originalClass) link.className = link.dataset.originalClass;
        navContainer.insertBefore(item, moreWrapper);
      });
      moreWrapper.classList.add('hidden');
      moreBtn.classList.remove('active', 'text-primary-600', 'bg-secondary-100');
      moreBtn.classList.add('inactive');
    };

    checkOverflow = () => {
      resetNav();

      // Filter visible category items (exclude moreWrapper which is hidden now)
      // Actually moreWrapper is child of navContainer.
      const navChildren = Array.from(navContainer.children).filter(el => el !== moreWrapper);

      if (navChildren.length === 0) return;

      const firstTop = navChildren[0].offsetTop;
      const lastItem = navChildren[navChildren.length - 1];

      // Check if last item wraps
      if (lastItem.offsetTop === firstTop) {
        // No wrapping even for the last item -> All fit!
        navContainer.style.overflow = 'visible';
        return;
      }

      // Wrapping detected! Show the "More" button to participate in layout
      moreWrapper.classList.remove('hidden');

      // Loop to move items to dropdown until everything fits on one line
      // We check if "moreWrapper" (which is now the last item) wraps.
      // Or if the item before it wraps.
      while (true) {
        // Current visible items (categories)
        const currentCategories = Array.from(navContainer.children).filter(el => el !== moreWrapper && el.style.display !== 'none');

        if (currentCategories.length === 0) break; // Should not happen

        const lastCategory = currentCategories[currentCategories.length - 1];

        // Check condition: Does "moreWrapper" wrap? Or does "lastCategory" wrap?
        // (We want everything on the first line)
        const moreWrapperWraps = moreWrapper.offsetTop > firstTop;
        const lastCategoryWraps = lastCategory.offsetTop > firstTop;

        if (!moreWrapperWraps && !lastCategoryWraps) {
          // Fits!
          break;
        }

        // Doesn't fit. Move lastCategory to dropdown.
        // Prepend to maintain order (4, 5 -> [5] -> [4, 5])

        // Save wrapper class
        if (!lastCategory.dataset.originalClass) {
          lastCategory.dataset.originalClass = lastCategory.className;
        }

        // Wrapper becomes a block item in dropdown
        lastCategory.className = 'menu-item-wrapper block w-full relative';

        // Adjust inner link style
        const link = lastCategory.querySelector('a');
        if (link) {
          link.dataset.originalClass = link.className;
          const isActive = link.classList.contains('active');
          link.className = 'dropdown-item w-full text-left px-4 py-2 text-sm';
          if (isActive) link.classList.add('active');
        }

        dropdown.insertBefore(lastCategory, dropdown.firstChild);
      }

      // Check if any item in dropdown is active and highlight More button
      const activeInDropdown = dropdown.querySelector('.active');
      if (activeInDropdown) {
        moreBtn.classList.add('active');
        moreBtn.classList.remove('inactive');
        moreBtn.classList.add('text-primary-600', 'bg-secondary-100');
      }

      // Restore overflow to visible to allow dropdowns (submenus) to show
      navContainer.style.overflow = 'visible';
    };

    // Initial check
    setTimeout(checkOverflow, 100);
    window.addEventListener('resize', () => {
      // Debounce
      clearTimeout(window.resizeTimer);
      window.resizeTimer = setTimeout(checkOverflow, 100);
    });

    // Toggle Dropdown
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdown.classList.contains('hidden');
      if (isHidden) {
        dropdown.classList.remove('hidden');
        document.body.classList.add('menu-open');
      } else {
        dropdown.classList.add('hidden');
        document.body.classList.remove('menu-open');
      }
    });

    // Close on click inside dropdown
    dropdown.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link) {
        dropdown.classList.add('hidden');
        document.body.classList.remove('menu-open');
      }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !moreBtn.contains(e.target)) {
        dropdown.classList.add('hidden');
        document.body.classList.remove('menu-open');
      }
    });
  }

  // ========== AJAX Navigation ==========
  document.addEventListener('click', async (e) => {
    const link = e.target.closest('a[href^="?catalog="]');
    if (!link) return;

    // Allow new tab clicks
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    const href = link.getAttribute('href');
    const catalogId = link.getAttribute('data-id');

    // 优先使用 data-name (横向菜单可能没有), 其次 textContent
    // 但侧边栏现在有 svg，text content 会包含换行符。需要 trim。
    let catalogName = link.textContent.trim();

    if (typeof closeSidebarMenu === 'function') {
      closeSidebarMenu();
    }

    const sitesGrid = document.getElementById('sitesGrid');
    if (!sitesGrid) return;

    sitesGrid.style.transition = 'opacity 0.15s ease-out';
    sitesGrid.style.opacity = '0';

    try {
      // 如果没有预加载数据，回退到普通跳转
      if (!window.IORI_SITES) {
        window.location.href = href;
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      sitesGrid.style.transition = 'none';
      sitesGrid.style.opacity = '1';

      const allSites = window.IORI_SITES || [];
      let filteredSites = [];

      if (catalogId) {
        // catalogId 是字符串，site.catelog_id 是数字，需转换
        filteredSites = allSites.filter(site => String(site.catelog_id) === String(catalogId));
      } else {
        // catalogId 为空表示“全部”
        filteredSites = allSites;
      }

      renderSites(filteredSites);
      updateHeading(null, catalogId ? catalogName : null, filteredSites.length);
      updateNavigationState(catalogId);

      // Remember Last Category Logic
      const config = window.IORI_LAYOUT_CONFIG || {};
      if (config.rememberLastCategory) {
        if (catalogId) {
          localStorage.setItem('iori_last_category', catalogId);
          setCookie('iori_last_category', catalogId, 365);
        } else {
          // Explicitly save "all" state
          localStorage.setItem('iori_last_category', 'all');
          setCookie('iori_last_category', 'all', 365);
        }
      }

    } catch (err) {
      console.error('Client-side navigation failed:', err);
    }
  });

  function setCookie(name, value, days) {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
  }

  function renderSites(sites) {
    const sitesGrid = document.getElementById('sitesGrid');
    if (!sitesGrid) return;

    // 重新渲染时清除搜索缓存，并重置搜索关键词状态（分类切换后输入框与卡片保持一致）
    searchCardCache = null;
    searchInputs.forEach(input => { input.value = ''; });
    currentKeyword = '';

    // 使用全局配置获取布局设置，避免依赖 DOM 推断
    const config = window.IORI_LAYOUT_CONFIG || {};
    const isFiveCols = config.gridCols === '5';
    const isSixCols = config.gridCols === '6';
    const hideDesc = config.hideDesc === true;
    const hideLinks = config.hideLinks === true;
    const hideCategory = config.hideCategory === true;
    const cardStyle = config.cardStyle || 'style1';

    sitesGrid.innerHTML = '';

    if (sites.length === 0) {
      sitesGrid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">本分类下暂无书签</div>';
      return;
    }

    sites.forEach((site, index) => {
      const rawName = site.name || '未命名';
      const safeName = escapeHTML(rawName);
      const normalizedUrl = sanitizeHttpUrl(site.url);
      const safeUrl = escapeHTML(normalizedUrl);
      const safeDesc = escapeHTML(site.desc || '暂无描述');
      const safeCatalog = escapeHTML(site.catelog_name || site.catelog || '未分类');
      const safeDisplayUrl = escapeHTML(normalizedUrl || '未提供链接');
      const cardInitial = escapeHTML((rawName.trim().charAt(0) || '站').toUpperCase());
      const cardInitialJs = (() => { const c = (rawName.trim().charAt(0) || '站').toUpperCase(); return /[A-Za-z0-9\u4e00-\u9fff]/.test(c) ? c : '站'; })();

      const isAboveFold = index < 8;
      const imgLoadingAttrs = isAboveFold ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
      // logo 二级兜底：src 失败 → onerror 换 data-fallback(本站代理)；代理也失败 → 字母块
      const logoInfo = resolveCardLogo(site, site.url);
      const logoFallbackAttr = logoInfo.fallback ? ` data-fallback="${escapeHTML(logoInfo.fallback)}"` : '';
      const logoHtml = logoInfo.src
        ? `<img src="${escapeHTML(logoInfo.src)}" alt="${safeName}" width="40" height="40" class="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-700"${logoFallbackAttr} ${imgLoadingAttrs} onerror="iconFallback(this,'${cardInitialJs}')">`
        : `<div class="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center text-white font-semibold text-lg shadow-inner">${cardInitial}</div>`;

      const descHtml = hideDesc ? '' : `<p class="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2" title="${safeDesc}">${safeDesc}</p>`;

      const hasValidUrl = !!normalizedUrl;
      const linksHtml = hideLinks ? '' : `
          <div class="mt-3 flex items-center justify-between">
            <span class="text-xs text-primary-600 dark:text-primary-400 truncate flex-1 min-w-0 mr-2" title="${safeDisplayUrl}">${safeDisplayUrl}</span>
            <button class="copy-btn relative flex items-center px-2 py-1 ${hasValidUrl ? 'bg-accent-100 text-accent-700 hover:bg-accent-200 dark:bg-accent-900/30 dark:text-accent-300 dark:hover:bg-accent-900/50' : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'} rounded-full text-xs font-medium transition-colors" data-url="${safeUrl}" ${hasValidUrl ? '' : 'disabled'}>
              <svg class="h-3 w-3 ${isFiveCols || isSixCols ? '' : 'mr-1'}"><use href="#icon-copy"/></svg>
              ${isFiveCols || isSixCols ? '' : '<span class="copy-text">复制</span>'}
              <span class="copy-success hidden absolute -top-8 right-0 bg-accent-500 text-white text-xs px-2 py-1 rounded shadow-md">已复制!</span>
            </button>
          </div>`;

      const categoryHtml = hideCategory ? '' : `
                <span class="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-secondary-100 text-primary-700 dark:bg-secondary-800 dark:text-primary-300">
                  ${safeCatalog}
                </span>`;

      const frostedClass = isFrostedEnabled ? 'frosted-glass-effect' : '';
      const cardStyleClass = cardStyle === 'style2' ? 'style-2' : '';
      const baseCardClass = isFrostedEnabled
        ? 'site-card group relative overflow-hidden transition-all'
        : 'site-card group relative bg-white border border-primary-100/60 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700';

      const card = document.createElement('div');
      card.className = `${baseCardClass} ${frostedClass} ${cardStyleClass} card-anim-enter`;
      const delay = Math.min(index, 12) * 20;
      if (delay > 0) {
        card.style.animationDelay = `${delay}ms`;
      }

      // Remove animation class after completion to ensure clean state
      card.addEventListener('animationend', () => {
        card.classList.remove('card-anim-enter');
        card.style.animation = 'none'; // 彻底禁用动画，防止干扰 Hover
        if (delay > 0) card.style.removeProperty('animation-delay');
      }, { once: true });

      card.setAttribute('data-id', site.id);

      const favBtnHtml = `
          <button type="button" class="fav-btn" data-fav-id="${escapeHTML(String(site.id))}" aria-pressed="false" aria-label="收藏常用" title="收藏常用">
            <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-star"/></svg>
          </button>`;

      card.innerHTML = `
        <div class="site-card-content">
          <a href="${safeUrl || '#'}" ${hasValidUrl ? 'target="_blank" rel="noopener noreferrer"' : ''} class="block">
            <div class="flex items-start">
              <div class="site-icon flex-shrink-0 mr-4 transition-all duration-300">
                ${logoHtml}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="site-title text-base font-medium text-gray-900 truncate transition-all duration-300 origin-left" title="${safeName}">${safeName}</h3>
                ${categoryHtml}
              </div>
            </div>
            ${descHtml}
          </a>
          ${linksHtml}
          ${favBtnHtml}
        </div>
        `;

      sitesGrid.appendChild(card);
    });

    // 客户端渲染的卡片同样回填星标状态（含常用芯片计数）
    applyFavoriteStates();
  }

  function updateNavigationState(catalogId) {
    // 1. Update states on standard nav items (in main container and dropdown)
    // 注意：不再调用 resetNav() 以避免打断用户交互
    const allLinks = document.querySelectorAll('a.nav-btn, a.dropdown-item');
    allLinks.forEach(link => {
      const linkId = link.getAttribute('data-id');
      const isActive = (!catalogId && !linkId) || (String(linkId) === String(catalogId));

      if (isActive) {
        link.classList.remove('inactive');
        link.classList.add('active', 'nav-item-active');
      } else {
        link.classList.remove('active', 'nav-item-active');
        link.classList.add('inactive');
      }
      // 保存状态，供 checkOverflow 恢复使用
      link.dataset.originalClass = link.className;
    });

    // 2. Parent highlighting
    const navContainer = document.getElementById('horizontalCategoryNav');
    if (navContainer) {
      const topWrappers = Array.from(navContainer.children);
      topWrappers.forEach(wrapper => {
        const topLink = wrapper.querySelector(':scope > a.nav-btn');
        if (!topLink) return;

        const topLinkId = topLink.getAttribute('data-id');
        // 如果顶级项不是当前分类，检查其子项是否有匹配
        if (String(topLinkId) !== String(catalogId)) {
          const subLink = wrapper.querySelector(`a[data-id="${catalogId}"]`);
          if (subLink) {
            topLink.classList.remove('inactive');
            topLink.classList.add('active', 'nav-item-active');
            topLink.dataset.originalClass = topLink.className;
          }
        }
      });
    }

    // 3. Highlight "More" button if active category is inside dropdown
    if (dropdown && moreBtn) {
      const activeInDropdown = dropdown.querySelector('.active');
      if (activeInDropdown) {
        moreBtn.classList.add('active', 'text-primary-600', 'bg-secondary-100');
        moreBtn.classList.remove('inactive');
      } else {
        moreBtn.classList.remove('active', 'text-primary-600', 'bg-secondary-100');
        moreBtn.classList.add('inactive');
      }
    }

    // 4. Highlight "All" button explicitly if no catalogId provided (means "All")
    if (!catalogId) {
      const allBtn = document.querySelector('a[href="?catalog=all"]');
      if (allBtn) {
        allBtn.classList.remove('inactive');
        allBtn.classList.add('active', 'nav-item-active');
      }
    }

    // Update Sidebar (Vertical Menu)
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      const links = sidebar.querySelectorAll('a[data-id], a[href="?catalog=all"]');
      links.forEach(link => {
        const svg = link.querySelector('svg');
        const linkId = link.getAttribute('data-id');
        const isActive = (!catalogId && !linkId) || (String(linkId) === String(catalogId));

        if (isActive) {
          // Active state
          link.classList.remove('hover:bg-gray-100', 'text-gray-700', 'dark:hover:bg-gray-800', 'dark:text-gray-300');
          link.classList.add('bg-secondary-100', 'text-primary-700', 'dark:bg-gray-800', 'dark:text-primary-400');

          if (svg) {
            svg.classList.remove('text-gray-400', 'dark:text-gray-500');
            svg.classList.add('text-primary-600', 'dark:text-primary-400');
          }
        } else {
          // Inactive state
          link.classList.remove('bg-secondary-100', 'text-primary-700', 'dark:bg-gray-800', 'dark:text-primary-400');
          link.classList.add('hover:bg-gray-100', 'text-gray-700', 'dark:text-gray-300', 'dark:hover:bg-gray-800');

          if (svg) {
            svg.classList.remove('text-primary-600', 'dark:text-primary-400');
            svg.classList.add('text-gray-400', 'dark:text-gray-500');
          }
        }
      });
    }
  }

  // 辅助函数
  const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => _ESC[c]);
  }

  function sanitizeHttpUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (!/^https?:\/\//i.test(trimmed)) return '';
    try {
      const parsed = new URL(trimmed);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch {
      return '';
    }
  }

  // 与服务端 resolveCardLogoUrl 同逻辑（浏览器端独立实现）：
  // 空 logo / 第三方 favicon 服务直链 → 本站多源代理；用户自定义直链保留并挂二级兜底
  const KNOWN_FAVICON_HOST_SUFFIXES = ['faviconsnap.com', 'favicon.im', 'icons.duckduckgo.com', 'gstatic.com', 'googleusercontent.com'];

  function resolveCardLogo(site, siteUrl) {
    let domain = '';
    if (siteUrl && /^https?:\/\//i.test(siteUrl)) {
      try {
        const host = new URL(siteUrl).hostname.toLowerCase();
        if (host.includes('.') && host.length <= 253) domain = host;
      } catch { /* 无效 URL */ }
    }
    if (!domain) return { src: '', fallback: '' };

    const proxyUrl = '/favicon?url=' + encodeURIComponent(domain);
    const trimmed = String(site.logo || '').trim();
    if (trimmed && !trimmed.startsWith('data:image')) {
      const safeLogo = sanitizeHttpUrl(trimmed);
      if (safeLogo) {
        let logoHost = '', logoPath = '', parsed = null;
        try {
          parsed = new URL(safeLogo);
          logoHost = parsed.hostname.toLowerCase();
          logoPath = parsed.pathname;
        } catch { /* 不可达 */ }
        // 本站代理的绝对 URL 形式（ICON_API 指向本站时存库的值）→ 统一为相对路径，
        // 并保留其原有 url 参数（图标真正对应的域名）
        if (logoPath === '/favicon' && parsed) {
          const inner = (parsed.searchParams.get('url') || '').trim();
          let innerDomain = '';
          if (inner && inner.length <= 253) {
            let candidate = inner;
            if (!/^https?:\/\//i.test(candidate)) candidate = 'http://' + candidate;
            try {
              const h = new URL(candidate).hostname.toLowerCase();
              if (h.includes('.') && h.length <= 253) innerDomain = h;
            } catch { /* 忽略 */ }
          }
          if (innerDomain) return { src: '/favicon?url=' + encodeURIComponent(innerDomain), fallback: '' };
          return { src: proxyUrl, fallback: '' };
        }
        const known = KNOWN_FAVICON_HOST_SUFFIXES.some(s => logoHost === s || logoHost.endsWith('.' + s));
        if (known) return { src: proxyUrl, fallback: '' };
        return { src: safeLogo, fallback: proxyUrl };
      }
    }
    return { src: proxyUrl, fallback: '' };
  }

  // Auto-restore Last Category
  (function () {
    const config = window.IORI_LAYOUT_CONFIG || {};
    const urlParams = new URLSearchParams(window.location.search);
    const hasCatalogParam = urlParams.has('catalog');

    if (config.rememberLastCategory && !hasCatalogParam) {
      let lastId = localStorage.getItem('iori_last_category');

      // Fallback to Cookie if LocalStorage is missing (e.g. cleared or not synced)
      if (!lastId) {
        const match = document.cookie.match(/iori_last_category=(all|\d+)/);
        if (match) {
          lastId = match[1];
        }
      }

      if (lastId) {
        // 若与 SSR 当前渲染的分类一致，无需重绘（避免进入首屏一闪的客户端重建）
        // 同时跳过 updateHeading / updateNavigationState — SSR 已按该分类产出正确状态
        if (String(lastId) === String(config.ssrCatalogId)) {
          return;
        }

        if (lastId === 'all') {
          // Explicitly restore "All Categories" state
          const allSites = window.IORI_SITES || [];
          renderSites(allSites);
          updateHeading(null, null, allSites.length);
          updateNavigationState(null);
          return;
        }

        // Try to find the category link in DOM to get correct Name and Href
        const link = document.querySelector(`a[data-id="${lastId}"]`);

        if (link) {
          const href = link.getAttribute('href');
          // Clone logic from click handler
          // Note: link.textContent might contain garbage if it has icons.
          // But updateHeading handles it? No, we should be careful.
          // main.js click handler uses: let catalogName = link.textContent.trim();
          let catalogName = link.innerText.trim();

          const allSites = window.IORI_SITES || [];
          const filteredSites = allSites.filter(site => String(site.catelog_id) === String(lastId));

          renderSites(filteredSites);
          updateHeading(null, catalogName, filteredSites.length);
          updateNavigationState(lastId);
        } else {
          localStorage.removeItem('iori_last_category');
        }
      }
    }
  })();

  requestAnimationFrame(() => {
    document.body.classList.add('app-ready');
  });

  // Theme Toggle Logic
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark');
      const nextState = isDark ? 'light' : 'dark';

      const updateTheme = () => {
        if (nextState === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', nextState);
      };

      // Fallback for browsers without View Transitions
      if (!document.startViewTransition) {
        updateTheme();
        return;
      }

      // Add class for custom transition CSS
      document.documentElement.classList.add('theme-animating');

      const transition = document.startViewTransition(() => {
        updateTheme();
      });

      transition.finished.finally(() => {
        document.documentElement.classList.remove('theme-animating');
      });
    });
  }

  // ========== 键盘快捷键 ==========
  document.addEventListener('keydown', (e) => {
    const target = e.target;
    const isTyping = target && (
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' || target.isContentEditable
    );

    // `/` 或 Ctrl/⌘+K：聚焦搜索框（输入状态下的 / 不劫持；优先取当前可见的输入框，
    // 因为 horizontal 布局下移动端 vertical 头部是 display:none 但仍在 DOM 中）
    if ((e.key === '/' && !isTyping) || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) {
      const input = Array.from(searchInputs).find(el => el.getClientRects().length > 0) || searchInputs[0];
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
      return;
    }

    // Esc：关闭投稿模态框 > 清空搜索并退出输入焦点
    if (e.key === 'Escape') {
      if (addSiteModal && !addSiteModal.classList.contains('invisible')) {
        closeModal();
        return;
      }
      const active = document.activeElement;
      const focusedSearch = Boolean(active && active.classList && active.classList.contains('search-input-target'));
      if (focusedSearch || currentKeyword) {
        searchInputs.forEach(input => { input.value = ''; });
        applyCardFilters('');
        if (focusedSearch) active.blur();
      }
    }
  });

  // ========== 系统主题跟随（用户未手动选择过主题时生效） ==========
  const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemThemeChange = (e) => {
    if (localStorage.getItem('theme') !== null) return;
    document.documentElement.classList.toggle('dark', e.matches);
  };
  if (themeMedia.addEventListener) {
    themeMedia.addEventListener('change', onSystemThemeChange);
  } else if (themeMedia.addListener) {
    themeMedia.addListener(onSystemThemeChange); // 旧版 Safari
  }

  // ========== PWA Service Worker 注册（生产 HTTPS 或本地开发） ==========
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* 注册失败不影响正常浏览 */ });
    });
  }

});
