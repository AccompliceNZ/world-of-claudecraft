// Cold DOM adapter for the World Map atlas rail. Hud supplies the current
// world/zone whenever its existing map redraw path runs and may consume the
// filter and route callbacks without this module reaching into Hud.

import { QUESTS, type ZoneDef } from '../sim/data';
import type { IWorld } from '../world_api';
import { questObjectiveLabel, questTitle } from './entity_display_labels';
import { zoneDisplayName } from './entity_i18n';
import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { ownEntry } from './known_item';
import {
  buildMapSidebarView,
  DEFAULT_MAP_ATLAS_FILTERS,
  type MapAtlasFilterId,
  type MapAtlasFilters,
  type MapAtlasRoute,
  toggleMapAtlasFilter,
} from './map_sidebar_view';

const FILTERS: readonly MapAtlasFilterId[] = [
  'quests',
  'gather',
  'dungeons',
  'services',
  'players',
];

function mapQuestTitle(questId: string): string {
  return ownEntry(QUESTS, questId)
    ? questTitle(questId)
    : t('questUi.tracker.unknownQuest', { id: questId });
}

export interface MapSidebarControllerDeps {
  root(): HTMLElement;
  click(): void;
  onFiltersChanged(filters: Readonly<MapAtlasFilters>): void;
  onShowRoute(route: MapAtlasRoute): void;
  onUntrackQuest(questId: string): void;
}

export class MapSidebarController {
  private filters: MapAtlasFilters = { ...DEFAULT_MAP_ATLAS_FILTERS };
  private selectedQuestId: string | null = null;
  private route: MapAtlasRoute | null = null;
  private initializedSelection = false;
  private world: IWorld | null = null;
  private zone: ZoneDef | null = null;
  private mountedRoot: HTMLElement | null = null;
  // Write elision, not a data signature: the compared string is the freshly
  // BUILT html with every t() value already resolved, so a language switch
  // moves it and the rail repaints itself (see language_fanout_registry).
  private lastHtml = '';

  constructor(private readonly deps: MapSidebarControllerDeps) {}

  filterState(): Readonly<MapAtlasFilters> {
    return this.filters;
  }

  shownRoute(): MapAtlasRoute | null {
    return this.route;
  }

  update(world: IWorld, zone: ZoneDef): void {
    this.world = world;
    this.zone = zone;
    if (!this.initializedSelection) {
      this.selectedQuestId = world.questLog.keys().next().value ?? null;
      this.initializedSelection = true;
    }
    this.render();
  }

  private mount(): HTMLElement {
    const root = this.deps.root();
    if (this.mountedRoot === root) return root;
    this.mountedRoot?.removeEventListener('click', this.onClick);
    root.addEventListener('click', this.onClick);
    this.mountedRoot = root;
    return root;
  }

  private render(): void {
    const world = this.world;
    const zone = this.zone;
    if (!world || !zone) return;
    const model = buildMapSidebarView({
      world,
      zone,
      filters: this.filters,
      selectedQuestId: this.selectedQuestId,
    });
    this.selectedQuestId = model.selectedQuestId;
    if (this.route !== null) {
      this.route = model.route?.questId === this.route.questId ? model.route : null;
    }
    const levelRange = t('hudChrome.continentMap.levels', {
      min: formatNumber(model.levelRange[0], { maximumFractionDigits: 0 }),
      max: formatNumber(model.levelRange[1], { maximumFractionDigits: 0 }),
    });
    const filters = FILTERS.map((id) => {
      const on = model.filters[id];
      return `<button type="button" class="map-atlas-filter ui-seg-tab${on ? ' is-on' : ''}" data-map-filter="${id}" aria-pressed="${on}">${esc(t(`hudChrome.mapAtlas.filters.${id}`))}</button>`;
    }).join('');
    const quests = model.quests
      .map((quest) => {
        const title = mapQuestTitle(quest.questId);
        const objective =
          quest.ready || quest.objectiveIndex === null
            ? `<span class="map-atlas-ready ui-chip">${esc(t('questUi.tracker.complete'))}</span>`
            : `<span class="map-atlas-objective">${esc(
                t('questUi.detail.objectiveProgress', {
                  label: questObjectiveLabel(quest.questId, quest.objectiveIndex),
                  current: formatNumber(quest.current, { maximumFractionDigits: 0 }),
                  total: formatNumber(quest.required, { maximumFractionDigits: 0 }),
                }),
              )}</span>`;
        return `<button type="button" class="map-atlas-quest ui-card${quest.selected ? ' is-selected' : ''}${quest.ready ? ' is-ready' : ''}" data-map-quest="${esc(quest.questId)}" aria-pressed="${quest.selected}"><span class="map-atlas-quest-number">${formatNumber(quest.number, { maximumFractionDigits: 0 })}</span><span class="map-atlas-quest-copy"><span class="map-atlas-quest-title">${esc(title)}</span>${objective}</span></button>`;
      })
      .join('');
    const nearby = model.nearby
      .map((quest) => {
        const level =
          quest.minLevel === null
            ? ''
            : ` · ${esc(t('hudChrome.mapAtlas.level', { level: formatNumber(quest.minLevel, { maximumFractionDigits: 0 }) }))}`;
        return `<div class="map-atlas-nearby-row"><span>${esc(mapQuestTitle(quest.questId))}</span><span>${esc(zoneDisplayName(quest.zoneId))}${level} · ${esc(t('hudChrome.mapAtlas.distance', { distance: formatNumber(Math.round(quest.distance), { maximumFractionDigits: 0 }) }))}</span></div>`;
      })
      .join('');
    const root = this.mount();
    const html =
      `<header class="map-atlas-zone"><h2 class="ui-cin">${esc(zoneDisplayName(model.zoneId))}</h2><p class="ui-meta ui-muted">${esc(levelRange)} · ${esc(t('hudChrome.mapAtlas.landmarkCount', { count: formatNumber(model.landmarkCount, { maximumFractionDigits: 0 }) }))}</p></header>` +
      `<div class="map-atlas-filters ui-seg" role="group" aria-label="${esc(t('hudChrome.mapAtlas.filtersAria'))}">${filters}</div>` +
      `<section class="map-atlas-section"><h3 class="map-atlas-heading">${esc(t('hudChrome.mapAtlas.trackedQuests'))}</h3><div class="map-atlas-quest-list">${quests || `<p class="map-atlas-empty">${esc(t('hudChrome.mapAtlas.noTrackedQuests'))}</p>`}</div></section>` +
      `<div class="map-atlas-actions"><button type="button" class="map-atlas-route ui-btn ui-btn--red" data-map-route aria-pressed="${this.route?.questId === model.selectedQuestId}"${model.route ? '' : ' disabled'}>${esc(t('hudChrome.mapAtlas.showRoute'))}</button><button type="button" class="map-atlas-untrack ui-btn" data-map-untrack${model.selectedQuestId ? '' : ' disabled'}>${esc(t('hudChrome.mapAtlas.untrack'))}</button></div>` +
      `<section class="map-atlas-section map-atlas-nearby"><h3 class="map-atlas-heading is-secondary">${esc(t('hudChrome.mapAtlas.availableNearby'))}</h3>${nearby || `<p class="map-atlas-empty">${esc(t('hudChrome.mapAtlas.noNearbyQuests'))}</p>`}</section>` +
      `<footer class="map-atlas-legend"><span><i class="map-atlas-legend-mark is-dungeon" aria-hidden="true"></i>${esc(t('hudChrome.mapAtlas.legend.dungeon'))}</span><span><i class="map-atlas-legend-mark is-ore" aria-hidden="true"></i>${esc(t('hudChrome.mapAtlas.legend.ore'))}</span><span><i class="map-atlas-legend-mark is-herb" aria-hidden="true"></i>${esc(t('hudChrome.mapAtlas.legend.herb'))}</span><span><i class="map-atlas-legend-mark is-mail" aria-hidden="true"></i>${esc(t('hudChrome.mapAtlas.legend.mail'))}</span><span><i class="map-atlas-legend-mark is-passage" aria-hidden="true"></i>${esc(t('hudChrome.mapAtlas.legend.passage'))}</span></footer>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    root.innerHTML = html;
  }

  private readonly onClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const filter = target.closest<HTMLElement>('[data-map-filter]')?.dataset.mapFilter as
      | MapAtlasFilterId
      | undefined;
    if (filter && FILTERS.includes(filter)) {
      this.filters = toggleMapAtlasFilter(this.filters, filter);
      this.deps.click();
      this.deps.onFiltersChanged(this.filters);
      this.render();
      return;
    }
    const questId = target.closest<HTMLElement>('[data-map-quest]')?.dataset.mapQuest;
    if (questId) {
      this.selectedQuestId = questId;
      this.route = null;
      this.deps.click();
      this.render();
      return;
    }
    if (target.closest('[data-map-route]')) {
      const route =
        this.world && this.zone
          ? buildMapSidebarView({
              world: this.world,
              zone: this.zone,
              filters: this.filters,
              selectedQuestId: this.selectedQuestId,
            }).route
          : null;
      if (route) {
        this.route = route;
        this.deps.click();
        this.deps.onShowRoute(route);
        this.render();
      }
      return;
    }
    if (target.closest('[data-map-untrack]') && this.selectedQuestId !== null) {
      const quest = this.selectedQuestId;
      this.selectedQuestId = null;
      this.route = null;
      this.deps.click();
      this.deps.onUntrackQuest(quest);
      this.render();
    }
  };
}
