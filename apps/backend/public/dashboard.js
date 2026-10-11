      (function () {
        'use strict';

        var VALID_DECISIONS = ['AUTO_ALLOW', 'REQUIRE_CONFIRMATION', 'BLOCK'];

        function escapeHtml(value) {
          if (value == null) return '';
          var raw = String(value);
          return raw.replace(/[&<>"']/g, function (char) {
            return {
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;'
            }[char];
          });
        }

        function shortenId(id) {
          if (!id) return '';
          var str = String(id);
          if (str.length <= 16) return str;
          return str.slice(0, 8) + '…' + str.slice(-8);
        }

        function formatTimestamp(ts) {
          if (!ts) return '—';
          var d = new Date(ts);
          return isNaN(d.getTime()) ? '—' : d.toLocaleString();
        }

        function formatViolations(violations) {
          if (!violations || !violations.length) return '—';
          return violations.map(function (v) {
            return v.type || 'UNKNOWN';
          }).join(', ');
        }

        function decisionRenderer(params) {
          var value = (params.value || '').toUpperCase();
          var normalized = VALID_DECISIONS.includes(value) ? value : 'AUTO_ALLOW';
          var label = value;
          if (value === 'REQUIRE_CONFIRMATION') label = 'REQUIRE CONFIRMATION';
          return '<span class="badge decision-' + escapeHtml(normalized) + '">' + escapeHtml(label) + '</span>';
        }

        function shortIdRenderer(params) {
          var value = params.value || '';
          if (!value) return '—';
          var short = shortenId(value);
          return '<span title="' + escapeHtml(value) + '">' + escapeHtml(short) + '</span>';
        }

        function violationsRenderer(params) {
          var violations = params.value || [];
          if (!violations.length) return '<span>—</span>';

          var types = violations.map(function (v) {
            return v.type || 'UNKNOWN';
          });
          var safeTypes = types.join('; ');
          var fullInfo = violations.map(function (v) {
            return (v.type || 'UNKNOWN') + ': ' + (v.message || v.rule || '');
          }).join('\n');

          var tooltipText = escapeHtml(fullInfo);
          return '<span class="tooltip-wrap" title="' + tooltipText + '">' + escapeHtml(safeTypes) + '</span>';
        }

        function timeRenderer(params) {
          var value = params.value;
          var short = formatTimestamp(value);
          return '<span title="' + escapeHtml(value) + '">' + escapeHtml(short) + '</span>';
        }

        function moneyRenderer(params) {
          var minor = params.data.amountMinor;
          var currency = params.data.currency || 'EUR';
          if (typeof minor !== 'number') return '—';
          var formatted = (minor / 100).toLocaleString(undefined, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
          return '<span title="' + escapeHtml(currency + ' ' + minor) + '">' + escapeHtml(formatted) + '</span>';
        }

        function updateStats(stats) {
          var total = Number(stats?.totalRequests || 0);
          var allowed = Number(stats?.allowed || 0);
          var blocked = Number(stats?.blocked || 0);
          var spentFormatted = stats?.spentFormatted || formatMoneyFallback(0);

          document.getElementById('totalRequestsValue').textContent = String(total);
          document.getElementById('totalRequestsSub').textContent =
            total + ' total policy evaluations';
          document.getElementById('allowedValue').textContent = String(allowed);
          document.getElementById('allowedSub').textContent =
            allowed + ' non-block evaluations';
          document.getElementById('blockedValue').textContent = String(blocked);
          document.getElementById('blockedSub').textContent =
            blocked + ' policy violations';
          document.getElementById('spentValue').textContent = escapeHtml(stripped(spentFormatted));
          document.getElementById('spentSub').textContent =
            (stats?.spentMinor || 0) + ' ' + (stats?.spentFormatted ? '' : 'minor units') + ' from paid orders';
        }

        function formatMoneyFallback(minor) {
          return (Number(minor || 0) / 100).toLocaleString(undefined, {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        }

        function stripped(value) {
          return value == null ? '' : String(value);
        }

        function setLastUpdated(text) {
          document.getElementById('lastUpdatedText').textContent = text;
        }

        var gridOptions = {
          columnDefs: [
            {
              headerName: 'Time',
              field: 'timestamp',
              cellRenderer: timeRenderer,
              minWidth: 180,
              sort: 'desc'
            },
            {
              headerName: 'Agent',
              field: 'agent',
              minWidth: 130,
              cellRenderer: shortIdRenderer
            },
            {
              headerName: 'Cart ID',
              field: 'cartId',
              minWidth: 160,
              cellRenderer: shortIdRenderer
            },
            {
              headerName: 'Order ID',
              field: 'orderId',
              minWidth: 160,
              cellRenderer: shortIdRenderer
            },
            {
              headerName: 'Decision',
              field: 'decision',
              minWidth: 160,
              cellRenderer: decisionRenderer,
              filter: true
            },
            {
              headerName: 'Amount',
              minWidth: 120,
              cellRenderer: moneyRenderer
            },
            {
              headerName: 'Reason',
              field: 'reason',
              minWidth: 220,
              cellRenderer: function (params) {
                var val = params.value || '—';
                return '<span title="' + escapeHtml(val) + '">' + escapeHtml(val) + '</span>';
              }
            },
            {
              headerName: 'Violations',
              field: 'violatedRules',
              minWidth: 180,
              cellRenderer: violationsRenderer,
              filter: true
            }
          ],
          defaultColDef: { flex: 1, minWidth: 120, sortable: true, resizable: true, filter: true },
          getRowId: function (params) {
            return params.data.id;
          },
          rowData: [],
          onRowClicked: function (params) {
            openModal(params.data);
          }
        };

        var gridApi = agGrid.createGrid(
          document.getElementById('eventGrid'),
          gridOptions
        );

        var modal = document.getElementById('eventModal');
        var modalBody = document.getElementById('eventModalBody');
        var closeModalBtn = document.getElementById('closeModal');

        function openModal(event) {
          if (!event) return;

          var details = [
            { label: 'Event ID', value: event.id },
            { label: 'Timestamp', value: event.timestamp },
            { label: 'Session ID', value: event.sessionId || '—' },
            { label: 'Cart ID', value: event.cartId },
            { label: 'Order ID', value: event.orderId || '—' },
            { label: 'Agent', value: event.agent },
            { label: 'Amount', value: event.amountFormatted || event.amountMinor },
            { label: 'Currency', value: event.currency },
            { label: 'Decision', value: event.decision },
            { label: 'Reason', value: event.reason || '—' }
          ];

          var detailHtml = details
            .map(function (detail) {
              return '<div class="detail-item">' +
                '<span class="label">' + escapeHtml(detail.label) + '</span>' +
                '<div class="value">' + escapeHtml(detail.value) + '</div>' +
                '</div>';
            })
            .join('');

          var violations = event.violatedRules || [];
          var violationRows;
          if (violations.length === 0) {
            violationRows = '<tr><td colspan="4">—</td></tr>';
          } else {
            violationRows = violations
              .map(function (v) {
                return '<tr>' +
                  '<td>' + escapeHtml(v.type || '—') + '</td>' +
                  '<td>' + escapeHtml(v.rule || '—') + '</td>' +
                  '<td>' + escapeHtml(JSON.stringify(v.expected)) + '</td>' +
                  '<td>' + escapeHtml(v.message || '—') + '</td>' +
                  '</tr>';
              })
              .join('');
          }

          var policySnapshot = event.policySnapshot || {};
          var snapshotRows = Object.keys(policySnapshot)
            .map(function (key) {
              return '<tr>' +
                '<td>' + escapeHtml(key) + '</td>' +
                '<td>' + escapeHtml(JSON.stringify(policySnapshot[key])) + '</td>' +
                '</tr>';
            })
            .join('') || '<tr><td colspan="2">No snapshot</td></tr>';

          modalBody.innerHTML =
            '<div class="detail-grid">' + detailHtml + '</div>' +
            '<h4>Violations</h4>' +
            '<table><thead><tr><th>Type</th><th>Rule</th><th>Expected</th><th>Message</th></tr></thead><tbody>' +
            violationRows +
            '</tbody></table>' +
            '<h4 style="margin-top:18px;">Policy Snapshot</h4>' +
            '<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>' +
            snapshotRows +
            '</tbody></table>';

          modal.classList.add('visible');
          modal.setAttribute('aria-hidden', 'false');
        }

        function closeModal() {
          modal.classList.remove('visible');
          modal.setAttribute('aria-hidden', 'true');
        }

        closeModalBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function (event) {
          if (event.target === modal) closeModal();
        });

        function updateLastUpdated() {
          setLastUpdated('Updated ' + new Date().toLocaleTimeString());
        }

        async function refreshData() {
          var [eventsResponse, statsResponse] = await Promise.all([
            fetch('/api/policy-events?limit=100'),
            fetch('/api/policy-events/stats')
          ]);

          if (!eventsResponse.ok) {
            throw new Error('Policy events request failed: ' + eventsResponse.status);
          }
          if (!statsResponse.ok) {
            throw new Error('Stats request failed: ' + statsResponse.status);
          }

          var eventsPayload = await eventsResponse.json();
          var statsPayload = await statsResponse.json();

          gridApi.setGridOption('rowData', eventsPayload.events || []);
          updateStats(statsPayload);
          updateLastUpdated();
        }

        // 5-second polling (R10).
        refreshData().catch(function (err) {
          console.error(err);
          setLastUpdated('Error loading data');
        });

        setInterval(function () {
          refreshData().catch(function (err) {
            console.error(err);
            setLastUpdated('Error loading data');
          });
        }, 5000);
      })();