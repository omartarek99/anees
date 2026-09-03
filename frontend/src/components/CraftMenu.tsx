import { useMemo, useState } from 'react';
import { useLanguage } from '../lib/language-context';
import {
  ITEM,
  RECIPES,
  canCraft,
  invCount,
  type Inv,
  type Recipe,
  type RecipeCategory,
} from '../lib/craftItems';

const TABS: { key: RecipeCategory; labelKey: string; icon: string }[] = [
  { key: 'blocks', labelKey: 'craft.tabBlocks', icon: '🧱' },
  { key: 'tools', labelKey: 'craft.tabTools', icon: '⛏️' },
  { key: 'food', labelKey: 'craft.tabFood', icon: '🍞' },
  { key: 'potions', labelKey: 'craft.tabPotions', icon: '⚗️' },
];

function ItemChip({ id, size = 26 }: { id: number; size?: number }) {
  const def = ITEM[id];
  if (!def) return null;
  if (def.place || def.kind === 'block') {
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: 5,
          background: def.swatch ?? '#888',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
    );
  }
  if (def.emoji) return <span style={{ fontSize: size - 4, lineHeight: 1 }}>{def.emoji}</span>;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        background: def.swatch ?? '#556',
        color: '#fff',
        fontSize: 10,
        fontWeight: 800,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      {def.label ?? '?'}
    </span>
  );
}

export function CraftMenu({
  inventory,
  onCraft,
  onConsume,
  onClose,
}: {
  inventory: Inv;
  onCraft: (recipeId: string) => void;
  onConsume: (itemId: number) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<RecipeCategory>('blocks');

  const recipes = useMemo(() => RECIPES.filter((r) => r.category === tab), [tab]);

  const heldConsumables = useMemo(
    () =>
      Object.keys(inventory)
        .map(Number)
        .filter((id) => invCount(inventory, id) > 0 && (ITEM[id]?.kind === 'food' || ITEM[id]?.kind === 'potion'))
        .sort((a, b) => a - b),
    [inventory]
  );
  const heldOther = useMemo(
    () =>
      Object.keys(inventory)
        .map(Number)
        .filter((id) => invCount(inventory, id) > 0 && ITEM[id] && ITEM[id].kind !== 'food' && ITEM[id].kind !== 'potion')
        .sort((a, b) => a - b),
    [inventory]
  );

  const canMake = (r: Recipe) => canCraft(inventory, r);

  return (
    <div
      className="swiper-no-swiping"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 8,
        background: 'rgba(12,15,24,0.82)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        color: '#f4f6fb',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 15 }}>🧰 {t('craft.craftMenuTitle')}</strong>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          style={{
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            borderRadius: 8,
            width: 30,
            height: 30,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            style={{
              border: '1px solid rgba(255,255,255,0.22)',
              background: tab === tb.key ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.07)',
              color: '#fff',
              borderRadius: 999,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {tb.icon} {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {recipes.map((r) => {
            const ok = canMake(r);
            return (
              <div
                key={r.id}
                style={{
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 10,
                  padding: 8,
                  opacity: ok ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ItemChip id={r.out} />
                  <span style={{ fontSize: 12.5, fontWeight: 800 }}>
                    {t(ITEM[r.out]?.nameKey ?? r.id)}
                    {r.qty > 1 ? ` ×${r.qty}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, marginBottom: 6 }}>
                  {r.cost.map(([id, n]) => (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, opacity: invCount(inventory, id) >= n ? 1 : 0.6 }}>
                      <ItemChip id={id} size={16} />
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {invCount(inventory, id)}/{n}
                      </span>
                    </span>
                  ))}
                  {r.needs !== undefined && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, opacity: invCount(inventory, r.needs) >= 1 ? 1 : 0.6 }}>
                      <ItemChip id={r.needs} size={16} />
                      <span>{t('craft.needsStation')}</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!ok}
                  onClick={() => onCraft(r.id)}
                  style={{
                    width: '100%',
                    border: 'none',
                    borderRadius: 7,
                    padding: '6px 0',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: ok ? 'pointer' : 'not-allowed',
                    background: ok ? '#2f8f5b' : 'rgba(255,255,255,0.12)',
                    color: '#fff',
                  }}
                >
                  {t('craft.craftVerb')}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, fontWeight: 800, opacity: 0.85 }}>{t('craft.yourItems')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {heldConsumables.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onConsume(id)}
              title={t(ITEM[id].nameKey)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(120,200,140,0.16)',
                color: '#fff',
                borderRadius: 8,
                padding: '5px 9px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <ItemChip id={id} size={18} />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>×{invCount(inventory, id)}</span>
              <span style={{ opacity: 0.8 }}>{ITEM[id].kind === 'potion' ? t('craft.drinkVerb') : t('craft.eatVerb')}</span>
            </button>
          ))}
          {heldConsumables.length === 0 && <span style={{ fontSize: 11.5, opacity: 0.55 }}>{t('craft.noConsumables')}</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {heldOther.map((id) => (
            <span
              key={id}
              title={t(ITEM[id].nameKey)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 7,
                padding: '3px 7px',
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <ItemChip id={id} size={15} />
              {invCount(inventory, id)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
