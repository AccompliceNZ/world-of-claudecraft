import { specialRoleColor } from '../sim/discord_roles';
import type { Entity } from '../sim/types';
import { attachAvatarFallback } from './avatar_fallback';
import { devTierByIndex, devTierDisplayName } from './dev_tier';
import { discordRoleTagLabel } from './discord_role_tag';
import { discordStatusDisplayName } from './discord_tier';
import { esc } from './esc';
import { getLanguage, t } from './i18n';

/** Signature-gated owner for the target frame's linked-account flair line. */
export class TargetDiscordController {
  private signature = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly showDevBadges: () => boolean,
  ) {}

  update(target: Entity): void {
    const tier = target.discordTier ?? 0;
    const devIdx = this.showDevBadges() ? (target.devTier ?? 0) : 0;
    const isAi = target.aiAccount === true;
    if (
      target.kind !== 'player' ||
      (!tier && !target.discordName && !target.discordRole && !devIdx && !isAi)
    ) {
      if (this.signature !== '') {
        this.signature = '';
        this.root.classList.remove('show');
        this.root.replaceChildren();
      }
      return;
    }
    const signature = `${getLanguage()}|${tier}|${target.discordName ?? ''}|${target.discordRole ?? ''}|${target.discordAvatar ?? ''}|${devIdx}|${isAi ? 1 : 0}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const parts: string[] = [];
    const nameInner = target.discordAvatar
      ? `<img src="${esc(target.discordAvatar)}" referrerpolicy="no-referrer" alt="" draggable="false">${esc(target.discordName ?? '')}`
      : esc(target.discordName ?? '');
    if (target.discordName || target.discordAvatar) {
      parts.push(`<span class="uf-dc-name">${nameInner}</span>`);
    }
    const roleLabel = discordRoleTagLabel(target.discordRole);
    if (roleLabel) {
      parts.push(
        `<span class="uf-dc-chip role" style="--role:${specialRoleColor(target.discordRole) ?? 'var(--color-text-muted)'}">${esc(roleLabel)}</span>`,
      );
    }
    if (tier > 0) {
      parts.push(`<span class="uf-dc-chip rank">${esc(discordStatusDisplayName(tier))}</span>`);
    }
    const devDef = devTierByIndex(devIdx);
    if (devDef) {
      parts.push(`<span class="uf-dc-chip dev">${esc(devTierDisplayName(devDef))}</span>`);
    }
    if (isAi) {
      const title = esc(t('hudChrome.playerMenu.aiTagTitle'));
      parts.push(
        `<span class="ai-tag" role="img" aria-label="${title}" title="${title}">${esc(t('hudChrome.playerMenu.aiTag'))}</span>`,
      );
    }
    this.root.innerHTML = parts.join('');
    const avatar = this.root.querySelector<HTMLImageElement>('.uf-dc-name img');
    if (avatar) attachAvatarFallback(avatar);
    this.root.classList.add('show');
  }
}
