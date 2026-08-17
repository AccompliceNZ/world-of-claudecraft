<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet, apiPost } from '../api';
  import Badge from '../components/Badge.svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import Panel from '../components/Panel.svelte';
  import { fmtCopper, fmtDate, fmtNumber } from '../format';
  import { t } from '../i18n';
  import { auth } from '../state/auth.svelte';
  import type { EconomyAlertRow, EconomyAlertsData } from '../types';

  const PAGE_LIMIT = 100;

  let data = $state<EconomyAlertsData | null>(null);
  let failed = $state(false);
  let pendingAck = $state<EconomyAlertRow | null>(null);
  let acking = $state(false);
  let ackFailed = $state(false);
  let requestId = 0;

  // Explicit literal keys for the closed kind/severity sets (the UnstuckReports
  // outcome idiom): the i18n guard scans literal t('...') calls, so a template
  // key would be invisible to it. A kind this build does not know renders as its
  // raw id, so a newer server mid-deploy is still legible.
  function kindLabel(kind: string): string {
    if (kind === 'chain_break') return t('economyAlerts.kind.chainBreak');
    if (kind === 'balance_mismatch') return t('economyAlerts.kind.balanceMismatch');
    if (kind === 'supply_mismatch') return t('economyAlerts.kind.supplyMismatch');
    if (kind === 'orphaned_transfer') return t('economyAlerts.kind.orphanedTransfer');
    if (kind === 'evidence_incomplete') return t('economyAlerts.kind.evidenceIncomplete');
    return kind;
  }

  function severityLabel(severity: EconomyAlertRow['severity']): string {
    if (severity === 'critical') return t('economyAlerts.severity.critical');
    if (severity === 'warning') return t('economyAlerts.severity.warning');
    return t('economyAlerts.severity.info');
  }

  function severityVariant(severity: EconomyAlertRow['severity']): 'bad' | 'warn' | 'neutral' {
    if (severity === 'critical') return 'bad';
    if (severity === 'warning') return 'warn';
    return 'neutral';
  }

  // Signed on purpose: the sign IS the finding. Positive is coin the world
  // holds that the ledger cannot explain (the duplication direction), negative
  // is coin that vanished. fmtCopper floors at zero, so the sign rides outside.
  function signedCopper(delta: number): string {
    const magnitude = fmtCopper(Math.abs(delta));
    return delta < 0 ? `-${magnitude}` : `+${magnitude}`;
  }

  async function loadAlerts(): Promise<void> {
    const currentRequest = ++requestId;
    data = null;
    failed = false;
    try {
      const result = await apiGet<EconomyAlertsData>(
        `/admin/api/economy/alerts?limit=${PAGE_LIMIT}`,
      );
      if (currentRequest !== requestId) return;
      data = result;
    } catch (err) {
      if (currentRequest !== requestId) return;
      if (!auth.handleAuthFailure(err)) failed = true;
    }
  }

  async function confirmAck(): Promise<void> {
    const row = pendingAck;
    if (row === null || acking) return;
    acking = true;
    ackFailed = false;
    try {
      // The response's acknowledged:false (someone else got there first, or the
      // row is gone) needs no special arm: either way the finding is out of the
      // open queue, and the reload below is what makes the table say so.
      await apiPost<{ acknowledged: boolean }>(`/admin/api/economy/alerts/${row.id}/ack`, {});
      pendingAck = null;
      await loadAlerts();
    } catch (err) {
      if (!auth.handleAuthFailure(err)) ackFailed = true;
    } finally {
      acking = false;
    }
  }

  onMount(() => {
    void loadAlerts();
    return () => {
      requestId += 1;
    };
  });
</script>

<div class="economy-alerts-page">
  <p class="description">{t('economyAlerts.description')}</p>

  {#if failed}
    <Panel>
      <div class="request-state" role="alert">
        <p>{t('economyAlerts.loadFailed')}</p>
        <button type="button" onclick={() => void loadAlerts()}>
          {t('economyAlerts.retry')}
        </button>
      </div>
    </Panel>
  {:else if data === null}
    <Panel>
      <div class="request-state" role="status">{t('economyAlerts.loading')}</div>
    </Panel>
  {:else}
    <Panel title={t('economyAlerts.queueTitle')} hint={t('economyAlerts.queueHint')}>
      <div class="queue-summary">
        {#if data.criticals > 0}
          <Badge variant="bad" size="medium">
            {t('economyAlerts.criticalsOpen', { n: fmtNumber(data.criticals) })}
          </Badge>
        {:else}
          <Badge variant="success" size="medium">{t('economyAlerts.noCriticals')}</Badge>
        {/if}
      </div>

      {#if data.rows.length === 0}
        <div class="empty">{t('economyAlerts.empty')}</div>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard-scrollable table region) -->
        <div class="table-scroll" role="region" aria-label={t('economyAlerts.caption')} tabindex="0">
          <table class="alerts-table">
            <caption>{t('economyAlerts.caption')}</caption>
            <thead>
              <tr>
                <th>{t('economyAlerts.colWhen')}</th>
                <th>{t('economyAlerts.colKind')}</th>
                <th>{t('economyAlerts.colSeverity')}</th>
                <th>{t('economyAlerts.colCharacter')}</th>
                <th class="num">{t('economyAlerts.colDelta')}</th>
                <th>{t('economyAlerts.colDetail')}</th>
                {#if auth.can('economy.act')}
                  <th>{t('economyAlerts.colAction')}</th>
                {/if}
              </tr>
            </thead>
            <tbody>
              {#each data.rows as row (row.id)}
                <tr>
                  <td><time datetime={row.createdAt}>{fmtDate(row.createdAt)}</time></td>
                  <td>{kindLabel(row.kind)}</td>
                  <td>
                    <Badge variant={severityVariant(row.severity)}>
                      {severityLabel(row.severity)}
                    </Badge>
                  </td>
                  <td>
                    {#if row.characterId !== null}
                      {t('economyAlerts.characterId', { id: fmtNumber(row.characterId) })}
                    {:else}
                      <span class="text-dim">{t('economyAlerts.realmWide')}</span>
                    {/if}
                  </td>
                  <td class="num delta" class:positive={row.delta > 0}>
                    {signedCopper(row.delta)}
                  </td>
                  <!-- Server-authored English diagnostic, rendered as data (the
                       AntibotConfig rule): the chrome is t(), the finding is not. -->
                  <td class="detail-cell"><code>{row.detail}</code></td>
                  {#if auth.can('economy.act')}
                    <td>
                      <button
                        type="button"
                        disabled={acking}
                        onclick={() => {
                          ackFailed = false;
                          pendingAck = row;
                        }}
                      >
                        {t('economyAlerts.ack')}
                      </button>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if ackFailed}
        <div class="ack-failed" role="alert">{t('economyAlerts.ackFailed')}</div>
      {/if}

      {#if pendingAck !== null}
        {@const target = pendingAck}
        <ConfirmDialog
          title={t('economyAlerts.confirmTitle', { id: fmtNumber(target.id) })}
          rows={[
            { label: t('economyAlerts.colKind'), value: kindLabel(target.kind) },
            { label: t('economyAlerts.colDelta'), value: signedCopper(target.delta) },
          ]}
          confirmLabel={t('economyAlerts.ack')}
          onConfirm={() => void confirmAck()}
          onCancel={() => {
            pendingAck = null;
          }}
        />
        <p class="confirm-note">{t('economyAlerts.rearmNote')}</p>
      {/if}
    </Panel>
  {/if}
</div>

<style>
  .economy-alerts-page {
    display: grid;
    width: min(100%, 1500px);
    gap: 16px;
  }

  .description {
    color: var(--text-soft);
    line-height: 1.5;
  }

  .request-state {
    display: grid;
    justify-items: start;
    gap: 12px;
    padding: 18px;
    color: var(--text-soft);
  }

  .queue-summary {
    padding: 4px 0 12px;
  }

  caption {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .alerts-table {
    min-width: 1100px;
  }

  .table-scroll:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: -2px;
  }

  .delta.positive {
    color: var(--bad, #e66);
    font-weight: 600;
  }

  .detail-cell {
    max-width: 420px;
    white-space: normal;
    overflow-wrap: anywhere;
    font-size: 11px;
  }

  .ack-failed {
    padding: 10px 14px;
    color: var(--bad, #e66);
    font-size: 12px;
  }

  .confirm-note {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.4;
  }
</style>
