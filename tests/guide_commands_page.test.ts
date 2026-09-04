// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { pageFor } from '../src/guide/pages';
import { setLanguage } from '../src/ui/i18n';

// The General channel gained /all and /gen as command aliases beside /general
// and the classic /1 shortcut; the guide's command reference is the
// player-facing list of record, so pin all four spellings on the General row.
describe('Guide commands page: General channel row', () => {
  it('lists /general with its /all, /gen, and /1 aliases', () => {
    setLanguage('en');
    const html =
      pageFor('commands')?.render({
        params: [],
        sub: 'reference/commands',
        titleKey: 'guide.nav.commands',
      }) ?? '';
    expect(html).toContain('<kbd>/general &lt;message&gt;</kbd>');
    expect(html).toContain('<kbd>/all &lt;message&gt;</kbd>');
    expect(html).toContain('<kbd>/gen &lt;message&gt;</kbd>');
    expect(html).toContain('<kbd>/1 &lt;message&gt;</kbd>');
  });
});
