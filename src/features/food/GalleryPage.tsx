// 2026-10-23 美食专区 · Gallery（展示层，不改资料）。
// 初始：三列正方形照片墙。点一张：照片浮起离场 → 飞进上半屏 → 其余照片重排到下半屏 → 3D 文字从右侧进入。
// 状态：gallery → opening → expanded ⇄ switching → closing → gallery。动画进行中的点击一律忽略（连点保护）。
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import g from './Gallery.module.css';
import { FoodShell, leaveFood } from './FoodShell';
import { cachedThumb, decodedFull, useThumb, watchVisible } from './photos';
import { boxOf, EASE, flipTiles, heroPose, HERO_REST, INFO_IN, liftBox, measureTiles, reduceMotion, T, Timeline, TYPE_IN, TYPE_OUT, visibleIn, type Box } from './motion';
import { Icon } from '../../components/Icon';
import { useFoodEntries } from '../../hooks/food';
import { useSettings } from '../../hooks/data';
import { filterFoods, FOOD_CATEGORIES, FOOD_CATEGORY_LABEL, foodNavUrl, type FoodCategory, type FoodEntry } from '../../domain/food';
import { focusStyle } from '../../domain/guide';
import { openExternal } from '../../links/openLink';

type Phase = 'gallery' | 'opening' | 'expanded' | 'switching' | 'closing';
type Cat = FoodCategory | 'all';

/** 离开再回来（例如去资料库）时恢复分类和滚动位置 */
const memo: { cat: Cat; scroll: number } = { cat: 'all', scroll: 0 };

export default function GalleryPage() {
  const nav = useNavigate();
  const foods = useFoodEntries();
  const settings = useSettings();
  const [cat, setCat] = useState<Cat>(memo.cat);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [phase, setPhase] = useState<Phase>('gallery');
  const [layout, setLayout] = useState<'gallery' | 'expanded'>('gallery');
  /** 现在在上半屏的美食 */
  const [heroId, setHeroId] = useState<string | null>(null);
  const [heroSrc, setHeroSrc] = useState<string | null>(null);
  /** 不在下半屏网格里的那一张（正在上半屏） */
  const [outId, setOutId] = useState<string | null>(null);
  /** 在网格里占着位置但先隐藏（主图正飞回来） */
  const [landingId, setLandingId] = useState<string | null>(null);

  const page = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const tl = useRef<Timeline | null>(null);
  const busy = useRef(false);
  const galleryScroll = useRef(memo.scroll);

  const catRef = useRef(cat);
  catRef.current = cat;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // 卸载时取消未完成的动画；记住分类和滚动位置
  useEffect(
    () => () => {
      tl.current?.cancel();
      memo.cat = catRef.current;
      memo.scroll = layoutRef.current === 'gallery' ? scroller.current?.scrollTop ?? 0 : galleryScroll.current;
    },
    [],
  );

  // 第一次有资料时恢复滚动位置
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !foods || !scroller.current) return;
    restored.current = true;
    scroller.current.scrollTop = memo.scroll;
  }, [foods]);

  const list = foods ? filterFoods(foods, cat, q) : [];
  const grid = list.filter((f) => f.id !== outId);
  const heroFood = heroId ? foods?.find((f) => f.id === heroId) : undefined;

  // 上半屏那道美食被删掉了（例如在别的分页删除）：直接回到照片墙
  useEffect(() => {
    if (heroId && foods && !foods.some((f) => f.id === heroId) && phase === 'expanded') {
      tl.current?.cancel();
      busy.current = false;
      setHeroId(null);
      setOutId(null);
      setLandingId(null);
      setLayout('gallery');
      setPhase('gallery');
    }
  }, [foods, heroId, phase]);

  // Esc 返回（电脑）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'expanded') void close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const newTimeline = () => {
    tl.current?.cancel();
    const t = new Timeline();
    tl.current = t;
    return t;
  };
  const tileRadius = () => {
    const el = scroller.current?.querySelector<HTMLElement>('[data-food-id]');
    return el ? parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 : 12;
  };
  /** 下半屏 / 网格当前看得到的范围 */
  const viewBox = (): Box => (scroller.current ? boxOf(scroller.current) : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

  /** 把原图换上（解码好才换，不闪） */
  const upgradeHero = (f: FoodEntry, t: Timeline) => {
    if (!f.photoKey) return;
    void decodedFull(f.photoKey).then((u) => {
      if (u && !t.cancelled) setHeroSrc(u);
    });
  };

  const textIn = (t: Timeline, base: number, quick = false) => {
    const els = hero.current?.querySelectorAll<HTMLElement>('[data-txt]');
    els?.forEach((el) => {
      const k = el.dataset.txt;
      if (quick) {
        t.add(el, [{ opacity: 0 }, { opacity: 1 }], { delay: base, duration: 200, easing: 'ease-out' });
      } else if (k === 'name') {
        t.add(el, TYPE_IN, { delay: base, duration: T.nameDur, easing: EASE.type });
      } else if (k === 'bar') {
        t.add(el, [{ opacity: 0 }, { opacity: 1 }], { delay: base + 300, duration: 200, easing: 'ease-out' });
      } else {
        const i = Number(el.dataset.i ?? 0);
        t.add(el, INFO_IN, { delay: base + (T.infoDelay[i] ?? T.infoDelay[2]) - T.nameDelay, duration: T.infoDur, easing: EASE.type });
      }
    });
  };
  const textOut = (t: Timeline, quick = false) => {
    const els = [...(hero.current?.querySelectorAll<HTMLElement>('[data-txt]') ?? [])].reverse();
    els.forEach((el, i) => {
      if (quick || el.dataset.txt === 'bar') t.add(el, [{ opacity: 1 }, { opacity: 0 }], { duration: quick ? 160 : 180, easing: 'ease-in' });
      else t.add(el, TYPE_OUT, { delay: i * 40, duration: T.textOut - 60, easing: EASE.typeOut });
    });
  };

  // ———————— 开启：gallery → expanded ————————
  const open = async (f: FoodEntry) => {
    if (busy.current || phase !== 'gallery' || !scroller.current) return;
    busy.current = true;
    const t = newTimeline();
    const before = measureTiles(scroller.current);
    const from = before.get(f.id);
    galleryScroll.current = scroller.current.scrollTop;
    const radius = tileRadius();
    flushSync(() => {
      setLayout('expanded');
      setOutId(f.id);
      setHeroId(f.id);
      setHeroSrc(f.photoKey ? cachedThumb(f.photoKey) ?? null : null);
      setPhase('opening');
    });
    if (scroller.current) scroller.current.scrollTop = 0;
    const h = hero.current;
    if (!h) {
      busy.current = false;
      setPhase('expanded');
      return;
    }
    upgradeHero(f, t);
    if (reduceMotion() || !from) {
      t.add(h, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      textIn(t, 120, true);
    } else {
      const heroBox = boxOf(h);
      const start = heroPose(heroBox, from, radius);
      const lifted = heroPose(heroBox, liftBox(from), radius);
      t.add(
        h,
        [
          { ...start, filter: 'blur(0px) brightness(1)', opacity: 1, easing: EASE.lift },
          { ...lifted, filter: 'blur(1.5px) brightness(1.04)', opacity: 0.94, offset: T.liftAt, easing: EASE.fly },
          { ...HERO_REST, filter: 'blur(0px) brightness(1)', opacity: 1 },
        ],
        { duration: T.heroIn },
      );
      flipTiles(t, scroller.current!, before, { delay: T.reflowDelay, duration: T.reflowDur, skip: f.id });
      textIn(t, T.nameDelay);
    }
    await t.done();
    if (t.cancelled) return;
    t.clear();
    setPhase('expanded');
    busy.current = false;
  };

  // ———————— 返回：expanded → gallery ————————
  const close = async () => {
    if (busy.current || phase !== 'expanded' || !heroFood) return;
    busy.current = true;
    const t = newTimeline();
    const quick = reduceMotion();
    setPhase('closing');
    textOut(t, quick);
    await t.done();
    if (t.cancelled) return;
    const before = measureTiles(scroller.current);
    const id = heroFood.id;
    const radius = tileRadius();
    flushSync(() => {
      setLayout('gallery');
      setOutId(null);
      setLandingId(id);
    });
    if (scroller.current) scroller.current.scrollTop = galleryScroll.current;
    const h = hero.current;
    const target = scroller.current?.querySelector<HTMLElement>(`[data-food-id="${CSS.escape(id)}"]`);
    const move = new Timeline();
    tl.current = move;
    flyBack(move, h, target ? boxOf(target) : undefined, radius, T.heroOut, quick);
    if (!quick) flipTiles(move, scroller.current!, before, { delay: 0, duration: T.heroOut, skip: id });
    await move.done();
    if (move.cancelled) return;
    flushSync(() => {
      setLandingId(null);
      setHeroId(null);
      setHeroSrc(null);
      setPhase('gallery');
    });
    t.clear();
    move.clear();
    busy.current = false;
  };

  /** 主图回到网格里的格子；格子不在可见范围就原地淡出 */
  const flyBack = (t: Timeline, h: HTMLElement | null, target: Box | undefined, radius: number, duration: number, quick: boolean) => {
    if (!h) return;
    if (quick || !target || !visibleIn(target, viewBox())) {
      t.add(
        h,
        [
          { opacity: 1, transform: 'scale(1)', transformOrigin: '50% 50%', filter: 'blur(0px)' },
          { opacity: 0, transform: 'scale(0.94)', transformOrigin: '50% 50%', filter: 'blur(6px)' },
        ],
        { duration: quick ? 180 : 320, easing: EASE.typeOut },
      );
      return;
    }
    const heroBox = boxOf(h);
    t.add(
      h,
      [
        { ...HERO_REST, filter: 'blur(0px)', opacity: 1, easing: EASE.land },
        { ...heroPose(heroBox, liftBox(target, 1.1, 8), radius), filter: 'blur(1px)', opacity: 0.96, offset: 0.7, easing: EASE.lift },
        { ...heroPose(heroBox, target, radius), filter: 'blur(0px)', opacity: 1 },
      ],
      { duration },
    );
  };

  // ———————— 切换：expanded 里点另一张 ————————
  const switchTo = async (f: FoodEntry) => {
    if (busy.current || phase !== 'expanded' || !heroFood || f.id === heroFood.id) return;
    busy.current = true;
    const quick = reduceMotion();
    const out = newTimeline();
    setPhase('switching');
    textOut(out, quick);
    await out.done();
    if (out.cancelled) return;
    const radius = tileRadius();
    const oldId = heroFood.id;

    // ① 旧的主图回到下半屏网格（新的那张先留在网格里）
    const before1 = measureTiles(scroller.current);
    flushSync(() => {
      setOutId(null);
      setLandingId(oldId);
    });
    const back = new Timeline();
    tl.current = back;
    const slot = scroller.current?.querySelector<HTMLElement>(`[data-food-id="${CSS.escape(oldId)}"]`);
    flyBack(back, hero.current, slot ? boxOf(slot) : undefined, radius, T.switchOut, quick);
    if (!quick) flipTiles(back, scroller.current!, before1, { delay: 0, duration: T.switchOut, skip: oldId });
    await back.done();
    if (back.cancelled) return;

    // ② 新的照片从网格里浮起、飞进上半屏（同一时间只有一张主图）
    const before2 = measureTiles(scroller.current);
    const from = before2.get(f.id);
    flushSync(() => {
      setLandingId(null);
      setOutId(f.id);
      setHeroId(f.id);
      setHeroSrc(f.photoKey ? cachedThumb(f.photoKey) ?? null : null);
    });
    out.clear();
    back.clear();
    const t = new Timeline();
    tl.current = t;
    const h = hero.current;
    upgradeHero(f, t);
    if (h) {
      if (quick || !from) {
        t.add(h, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
        textIn(t, 120, true);
      } else {
        const heroBox = boxOf(h);
        t.add(
          h,
          [
            { ...heroPose(heroBox, from, radius), filter: 'blur(0px)', opacity: 1, easing: EASE.lift },
            { ...heroPose(heroBox, liftBox(from), radius), filter: 'blur(1.5px)', opacity: 0.94, offset: 0.4, easing: EASE.fly },
            { ...HERO_REST, filter: 'blur(0px)', opacity: 1 },
          ],
          { duration: T.switchIn },
        );
        flipTiles(t, scroller.current!, before2, { delay: 120, duration: 560, skip: f.id });
        textIn(t, T.switchIn);
      }
    }
    await t.done();
    if (t.cancelled) return;
    t.clear();
    setPhase('expanded');
    busy.current = false;
  };

  // ———————— 分类切换：照片重新排列（FLIP），不闪白 ————————
  const changeCat = (c: Cat) => {
    if (c === cat || busy.current || phase !== 'gallery') return;
    const before = measureTiles(scroller.current);
    flushSync(() => setCat(c));
    if (scroller.current) scroller.current.scrollTop = 0;
    if (reduceMotion()) return;
    const t = newTimeline();
    flipTiles(t, scroller.current!, before, { delay: 0, duration: 420, stagger: 10 });
    void t.done().then(() => !t.cancelled && t.clear());
  };

  const onTile = (f: FoodEntry) => {
    if (phase === 'gallery') void open(f);
    else if (phase === 'expanded') void switchTo(f);
  };

  const navUrl = heroFood ? foodNavUrl(heroFood, settings) : undefined;
  const empty = foods && foods.length === 0;

  return (
    <FoodShell>
      <div ref={page} className={g.page} data-layout={layout} data-phase={phase}>
        {/* 顶部：标题、搜索、管理、分类（展开时淡出） */}
        <header className={g.head} aria-hidden={layout !== 'gallery'}>
          {searching ? (
            <div className={g.searchRow}>
              <label className={g.searchBox}>
                <Icon name="Search" size="sm" />
                <input
                  autoFocus
                  type="search"
                  enterKeyHint="search"
                  placeholder="搜索美食、店名、地址…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="搜索美食"
                />
              </label>
              <button
                type="button"
                className={g.cancel}
                onClick={() => {
                  setQ('');
                  setSearching(false);
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <div className={g.titleRow}>
              <button type="button" className={`${g.roundBtn} ${g.exitBtn}`} aria-label="离开美食专区" onClick={() => leaveFood(nav)}>
                <Icon name="ChevronLeft" />
              </button>
              <div className={g.titleText}>
                <span className={g.brandLine}>Tongxing8</span>
                <h1 className={g.title}>美食专区</h1>
              </div>
              <button type="button" className={g.roundBtn} aria-label="搜索美食" onClick={() => setSearching(true)} disabled={!foods?.length}>
                <Icon name="Search" />
              </button>
              <button type="button" className={`${g.roundBtn} ${g.editBtn}`} aria-label="管理美食资料库" onClick={() => nav('/food/database')}>
                <Icon name="Pencil" />
              </button>
            </div>
          )}
          <div className={g.pills} role="tablist" aria-label="美食分类">
            {(['all', ...FOOD_CATEGORIES.map((c) => c.key)] as Cat[]).map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cat === c} className={`${g.pill} ${cat === c ? g.pillOn : ''}`} onClick={() => changeCat(c)}>
                {c === 'all' ? '全部' : FOOD_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </header>

        {/* 照片墙：初始全屏三列；展开后在下半屏，可单独滚动 */}
        <div ref={scroller} className={g.scroller}>
          {foods === undefined ? null : empty ? (
            <div className={g.empty}>
              <Icon name="Utensils" size="lg" />
              <p className={g.emptyTitle}>美食册还是空的</p>
              <p className={g.emptyText}>去资料库加上第一道美食和它的照片，这里就会变成你的美食摄影展。</p>
              <button type="button" className={g.emptyBtn} onClick={() => nav('/food/database/new')}>
                <Icon name="Plus" size="sm" />
                新增美食
              </button>
            </div>
          ) : grid.length === 0 ? (
            <p className={g.none}>{layout === 'expanded' ? '没有其他美食了' : q ? `找不到「${q}」相关的美食` : '这个分类还没有美食'}</p>
          ) : (
            <div className={g.grid}>
              {grid.map((f) => (
                <Tile key={f.id} f={f} hidden={f.id === landingId} onClick={() => onTile(f)} />
              ))}
            </div>
          )}
        </div>

        {/* 上半屏：主图 + 3D 文字（同一页面里的互动结构，不是另一页） */}
        {heroFood && (
          <section ref={hero} className={g.hero} aria-label={`${heroFood.name} 详情`}>
            {heroSrc ? (
              <img className={g.heroImg} src={heroSrc} alt={heroFood.name} style={focusStyle(heroFood.photoFocus) as CSSProperties} draggable={false} onError={() => setHeroSrc(null)} />
            ) : (
              <div className={g.heroEmpty}>
                <Icon name="Utensils" size="lg" />
              </div>
            )}
            <div className={g.heroShade} aria-hidden />
            <div className={g.heroBar} data-txt="bar">
              <button type="button" className={`${g.glassBtn} ${g.backBtn}`} aria-label="返回美食照片墙" onClick={() => void close()}>
                <Icon name="ChevronLeft" />
              </button>
              <span className={g.navWrap}>
                <button
                  type="button"
                  className={`${g.glassBtn} ${g.navBtn}`}
                  disabled={!navUrl}
                  aria-describedby={navUrl ? undefined : 'food-nav-why'}
                  onClick={() => navUrl && openExternal(navUrl, heroFood.address)}
                >
                  <Icon name="Navigation" size="sm" />
                  导航
                </button>
                {!navUrl && (
                  <span id="food-nav-why" className={g.navWhy}>
                    没有地址，无法导航
                  </span>
                )}
              </span>
            </div>
            <div className={g.heroText}>
              <h2 className={g.heroName} data-txt="name">
                {heroFood.name}
              </h2>
              <span className={g.heroCat} data-txt="info" data-i="0">
                {FOOD_CATEGORY_LABEL[heroFood.category]}
              </span>
            </div>
            <div className={g.heroInfo}>
              <div className={g.infoCard} data-txt="info" data-i="1">
                <Icon name="Building2" size="sm" />
                <span>
                  <small>店名</small>
                  <strong>{heroFood.restaurantName}</strong>
                </span>
              </div>
              <div className={g.infoCard} data-txt="info" data-i="2">
                <Icon name="MapPin" size="sm" />
                <span>
                  <small>地址</small>
                  <strong>{heroFood.address}</strong>
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
    </FoodShell>
  );
}

/** 一张正方形照片；进入可见范围才读取缩略图 */
function Tile({ f, hidden, onClick }: { f: FoodEntry; hidden: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => (ref.current && !near ? watchVisible(ref.current, () => setNear(true)) : undefined), [near]);
  const src = useThumb(f.photoKey, near);
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return (
    <button ref={ref} type="button" className={`${g.tile} ${hidden ? g.tileHidden : ''}`} data-food-id={f.id} onClick={onClick} aria-label={`${f.name} · ${f.restaurantName}`}>
      {src && !bad ? (
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false} style={focusStyle(f.photoFocus) as CSSProperties} onError={() => setBad(true)} />
      ) : src === undefined && f.photoKey ? null : (
        <span className={g.tileEmpty}>
          <Icon name="Utensils" size="sm" />
          <span>{f.name}</span>
        </span>
      )}
    </button>
  );
}
