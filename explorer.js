(function () {
  "use strict";

  const CONFIG = {
    chainId: "ipi-testnet-1",
    evmChainId: 42424,
    locale: "en-US",
    denom: "aipi",
    displayDenom: "IPI",
    decimals: 18,
    rpcBase: "/api/rpc",
    restBase: "/api/rest",
    evmEndpoint: "/api/evm/rpc",
  };

  const app = document.getElementById("app");
  const searchForm = document.getElementById("global-search");
  const searchInput = document.getElementById("search-input");
  const menuButton = document.getElementById("menu-button");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("scrim");
  const toast = document.getElementById("toast");
  const blockTimeCache = new Map();
  let toastTimer;
  let searchSequence = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function encodePath(value) {
    return encodeURIComponent(String(value));
  }

  function shorten(value, head, tail) {
    const text = String(value || "");
    const start = head || 9;
    const end = tail || 7;
    if (text.length <= start + end + 3) {
      return text || "—";
    }
    return text.slice(0, start) + "…" + text.slice(-end);
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat(CONFIG.locale, { maximumFractionDigits: 0 }).format(number(value));
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleString(CONFIG.locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function relativeTime(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) {
      return "—";
    }
    const delta = Math.max(0, Date.now() - time);
    const seconds = Math.floor(delta / 1000);
    if (seconds < 60) {
      return seconds + "s ago";
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return minutes + "m ago";
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours + "h ago";
    }
    return Math.floor(hours / 24) + "d ago";
  }

  function formatDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) {
      return "—";
    }
    return value < 10 ? value.toFixed(2) + "s" : Math.round(value) + "s";
  }

  function formatUnits(value, decimals, symbol, compact) {
    try {
      const raw = BigInt(String(value || "0"));
      const base = 10n ** BigInt(decimals);
      const whole = raw / base;
      const fraction = (raw % base).toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
      if (compact && whole > 9999n) {
        return new Intl.NumberFormat(CONFIG.locale, {
          notation: "compact",
          maximumFractionDigits: 2,
        }).format(Number(whole)) + " " + symbol;
      }
      return whole.toLocaleString(CONFIG.locale) + (fraction ? "." + fraction : "") + " " + symbol;
    } catch (error) {
      return String(value || "0") + " " + symbol;
    }
  }

  function formatIpi(value, compact) {
    return formatUnits(value, CONFIG.decimals, CONFIG.displayDenom, compact);
  }

  function hexToBigInt(value) {
    try {
      return BigInt(value || "0x0");
    } catch (error) {
      return 0n;
    }
  }

  function formatGwei(value) {
    const wei = hexToBigInt(value);
    const whole = wei / 1000000000n;
    const fraction = (wei % 1000000000n).toString().padStart(9, "0").slice(0, 3).replace(/0+$/, "");
    return whole.toString() + (fraction ? "." + fraction : "") + " gwei";
  }

  function parseCoin(value) {
    const text = String(value || "").split(",")[0];
    const match = text.match(/^([0-9]+)([a-zA-Z][a-zA-Z0-9/._-]*)$/);
    if (!match) {
      return { amount: "0", denom: text || CONFIG.denom };
    }
    return { amount: match[1], denom: match[2] };
  }

  function formatCoin(value, compact) {
    const coin = parseCoin(value);
    if (coin.denom === CONFIG.denom) {
      return formatIpi(coin.amount, compact);
    }
    return coin.amount + " " + coin.denom;
  }

  function titleCaseAction(value) {
    const tail = String(value || "Transaction").split(".").pop().replace(/^Msg/, "");
    return tail.replace(/([a-z0-9])([A-Z])/g, "$1 $2") || "Transaction";
  }

  function apiUrl(base, path, params) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    const url = new URL(base + (cleanPath ? "/" + cleanPath : ""), window.location.origin);
    Object.entries(params || {}).forEach(function (entry) {
      if (entry[1] !== undefined && entry[1] !== null && entry[1] !== "") {
        url.searchParams.set(entry[0], String(entry[1]));
      }
    });
    return url.toString();
  }

  async function requestJson(url, options) {
    const response = await fetch(url, Object.assign({ cache: "no-store" }, options || {}));
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error("The endpoint returned invalid JSON.");
    }
    if (!response.ok) {
      throw new Error(payload.message || payload.error || "Request failed with HTTP " + response.status + ".");
    }
    if (payload.error) {
      throw new Error(payload.error.message || "RPC request failed.");
    }
    return payload;
  }

  async function rpc(method, params) {
    return requestJson(apiUrl(CONFIG.rpcBase, method, params));
  }

  async function rest(path, params) {
    return requestJson(apiUrl(CONFIG.restBase, path, params));
  }

  async function evm(method, params) {
    const payload = await requestJson(CONFIG.evmEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: method, params: params || [] }),
    });
    if (payload.error) {
      throw new Error(payload.error.message || "EVM RPC request failed.");
    }
    return payload.result;
  }

  function quotedQuery(query) {
    return '"' + query + '"';
  }

  function eventAttribute(events, type, key) {
    const list = Array.isArray(events) ? events : [];
    for (let index = 0; index < list.length; index += 1) {
      const event = list[index];
      if (event.type !== type) {
        continue;
      }
      const attributes = Array.isArray(event.attributes) ? event.attributes : [];
      const found = attributes.find(function (attribute) {
        return attribute.key === key;
      });
      if (found) {
        return found.value;
      }
    }
    return "";
  }

  function attributeFromEvent(event, key) {
    const attributes = event && Array.isArray(event.attributes) ? event.attributes : [];
    const found = attributes.find(function (attribute) {
      return attribute.key === key;
    });
    return found ? found.value : "";
  }

  function txSummary(tx) {
    const result = tx.tx_result || {};
    const events = result.events || [];
    const transferEvents = events.filter(function (event) {
      return event.type === "transfer";
    });
    const messageTransfer =
      transferEvents.find(function (event) {
        return Boolean(attributeFromEvent(event, "msg_index"));
      }) ||
      transferEvents[transferEvents.length - 1] ||
      null;
    const sender =
      attributeFromEvent(messageTransfer, "sender") ||
      eventAttribute(events, "message", "sender") ||
      eventAttribute(events, "tx", "fee_payer");
    const recipient =
      attributeFromEvent(messageTransfer, "recipient") ||
      eventAttribute(events, "coin_received", "receiver") ||
      eventAttribute(events, "wasm", "_contract_address");
    const amount =
      attributeFromEvent(messageTransfer, "amount") ||
      eventAttribute(events, "coin_received", "amount") ||
      eventAttribute(events, "coin_spent", "amount");
    const fee = eventAttribute(events, "tx", "fee");
    const action = eventAttribute(events, "message", "action");
    return {
      hash: tx.hash || "",
      height: tx.height || "",
      code: number(result.code),
      sender: sender,
      recipient: recipient,
      amount: amount,
      fee: fee,
      action: titleCaseAction(action),
      actionRaw: action,
      gasWanted: result.gas_wanted || "0",
      gasUsed: result.gas_used || "0",
      log: result.log || "",
      events: events,
      time: tx.time || "",
    };
  }

  async function fetchStatus() {
    const payload = await rpc("status");
    return payload.result;
  }

  async function fetchBlocks(count, beforeHeight) {
    const status = await fetchStatus();
    const latest = number(status.sync_info.latest_block_height);
    const max = Math.min(beforeHeight ? number(beforeHeight) : latest, latest);
    const min = Math.max(1, max - Math.max(1, count) + 1);
    const payload = await rpc("blockchain", { minHeight: min, maxHeight: max });
    const blocks = (payload.result.block_metas || []).slice().sort(function (a, b) {
      return number(b.header.height) - number(a.header.height);
    });
    return { latest: latest, blocks: blocks, status: status, min: min, max: max };
  }

  async function fetchBlockTime(height) {
    const key = String(height);
    if (blockTimeCache.has(key)) {
      return blockTimeCache.get(key);
    }
    try {
      const payload = await rpc("block", { height: key });
      const time = payload.result.block.header.time;
      blockTimeCache.set(key, time);
      return time;
    } catch (error) {
      return "";
    }
  }

  async function fetchTransactions(limit, query) {
    const payload = await rpc("tx_search", {
      query: quotedQuery(query || "tx.height>0"),
      prove: "false",
      page: "1",
      per_page: String(limit || 20),
      order_by: '"desc"',
    });
    const transactions = (payload.result.txs || []).map(txSummary);
    await Promise.all(transactions.map(async function (transaction) {
      transaction.time = await fetchBlockTime(transaction.height);
    }));
    return {
      total: number(payload.result.total_count),
      transactions: transactions,
    };
  }

  async function fetchValidators() {
    const payload = await rest("cosmos/staking/v1beta1/validators", {
      status: "BOND_STATUS_BONDED",
      "pagination.limit": "100",
    });
    return payload.validators || [];
  }

  function averageBlockTime(blocks) {
    if (!blocks || blocks.length < 2) {
      return 0;
    }
    const times = blocks
      .map(function (block) { return new Date(block.header.time).getTime(); })
      .filter(Number.isFinite)
      .sort(function (a, b) { return b - a; });
    if (times.length < 2) {
      return 0;
    }
    return (times[0] - times[times.length - 1]) / 1000 / (times.length - 1);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2600);
  }

  function setLoading() {
    app.innerHTML = [
      '<section class="loading-page">',
      '<div class="skeleton skeleton-title"></div>',
      '<div class="metric-grid">',
      '<div class="skeleton skeleton-card"></div>',
      '<div class="skeleton skeleton-card"></div>',
      '<div class="skeleton skeleton-card"></div>',
      '<div class="skeleton skeleton-card"></div>',
      "</div>",
      '<div class="dashboard-grid">',
      '<div class="skeleton skeleton-card" style="height:360px"></div>',
      '<div class="skeleton skeleton-card" style="height:360px"></div>',
      "</div>",
      "</section>",
    ].join("");
  }

  function renderError(title, error) {
    app.innerHTML = [
      '<section class="error-state">',
      "<div>",
      '<span class="empty-icon">!</span>',
      "<h1>" + escapeHtml(title) + "</h1>",
      "<p>" + escapeHtml(error && error.message ? error.message : error) + "</p>",
      '<button class="action-button primary" data-reload="true" style="margin-top:18px">Try again</button>',
      "</div>",
      "</section>",
    ].join("");
  }

  function pageHead(eyebrow, title, description, note) {
    return [
      '<header class="page-head">',
      "<div>",
      '<span class="eyebrow">' + escapeHtml(eyebrow) + "</span>",
      "<h1>" + escapeHtml(title) + "</h1>",
      description ? "<p>" + escapeHtml(description) + "</p>" : "",
      "</div>",
      note ? '<span class="refresh-note">' + escapeHtml(note) + "</span>" : "",
      "</header>",
    ].join("");
  }

  function metricCard(label, value, note, className) {
    return [
      '<article class="metric-card ' + escapeHtml(className || "") + '">',
      "<small>" + escapeHtml(label) + "</small>",
      "<strong>" + escapeHtml(value) + "</strong>",
      "<span>" + escapeHtml(note) + "</span>",
      "</article>",
    ].join("");
  }

  function blockRows(blocks) {
    if (!blocks.length) {
      return '<div class="empty-state"><div><span class="empty-icon">◇</span><h2>No blocks found</h2><p>The RPC did not return blocks for this range.</p></div></div>';
    }
    return '<div class="block-list">' + blocks.map(function (block) {
      const header = block.header;
      const height = header.height;
      return [
        '<a class="block-row" href="#/block/' + encodePath(height) + '" style="text-decoration:none;color:inherit">',
        '<span class="row-symbol">◇</span>',
        '<span class="block-meta">',
        '<strong class="primary-link mono">#' + escapeHtml(formatInteger(height)) + "</strong>",
        "<span>" + escapeHtml(relativeTime(header.time)) + "</span>",
        "</span>",
        '<span class="block-hash mono">' + escapeHtml(block.block_id.hash) + "</span>",
        '<span class="block-meta" style="text-align:right">',
        "<strong>" + escapeHtml(formatInteger(block.num_txs || 0)) + "</strong>",
        "<span>transactions</span>",
        "</span>",
        "</a>",
      ].join("");
    }).join("") + "</div>";
  }

  function txRows(transactions) {
    if (!transactions.length) {
      return '<div class="empty-state"><div><span class="empty-icon">↔</span><h2>No transactions yet</h2><p>This chain has no indexed transactions matching the current query.</p></div></div>';
    }
    return [
      '<div class="table-wrap"><table>',
      "<thead><tr><th>Transaction</th><th>Type</th><th>Block</th><th>From / To</th><th>Amount</th><th>Status</th></tr></thead>",
      "<tbody>",
      transactions.map(function (transaction) {
        const href = "#/tx/" + encodePath(transaction.hash);
        const amount = transaction.amount ? formatCoin(transaction.amount, true) : "—";
        return [
          "<tr>",
          '<td><div class="tx-cell"><span class="row-symbol">↔</span><div>',
          '<a class="primary-link mono" href="' + href + '">' + escapeHtml(shorten(transaction.hash, 11, 7)) + "</a>",
          '<span class="subline">' + escapeHtml(transaction.time ? relativeTime(transaction.time) : "Block " + transaction.height) + "</span>",
          "</div></div></td>",
          '<td><span class="type-pill">' + escapeHtml(transaction.action) + "</span></td>",
          '<td><a class="primary-link mono" href="#/block/' + encodePath(transaction.height) + '">#' + escapeHtml(formatInteger(transaction.height)) + "</a></td>",
          "<td>",
          transaction.sender ? '<a class="address-link mono" href="#/address/' + encodePath(transaction.sender) + '">' + escapeHtml(shorten(transaction.sender, 7, 5)) + "</a>" : "—",
          transaction.recipient ? '<span class="subline">to <a class="address-link mono" href="#/address/' + encodePath(transaction.recipient) + '">' + escapeHtml(shorten(transaction.recipient, 7, 5)) + "</a></span>" : "",
          "</td>",
          '<td class="amount">' + escapeHtml(amount) + "</td>",
          '<td><span class="status-pill ' + (transaction.code === 0 ? "success" : "failed") + '">' + (transaction.code === 0 ? "Success" : "Failed") + "</span></td>",
          "</tr>",
        ].join("");
      }).join(""),
      "</tbody></table></div>",
    ].join("");
  }

  function compactTxRows(transactions) {
    if (!transactions.length) {
      return '<div class="empty-state"><div><span class="empty-icon">↔</span><h2>No transactions yet</h2><p>Indexed activity will appear here.</p></div></div>';
    }
    return '<div class="tx-feed">' + transactions.map(function (transaction) {
      const amount = transaction.amount ? formatCoin(transaction.amount, true) : "—";
      return [
        '<a class="tx-feed-row" href="#/tx/' + encodePath(transaction.hash) + '">',
        '<span class="row-symbol">↔</span>',
        '<span class="tx-feed-main">',
        '<strong class="primary-link mono">' + escapeHtml(shorten(transaction.hash, 10, 6)) + "</strong>",
        '<span class="subline">' + escapeHtml(transaction.time ? relativeTime(transaction.time) : "Block " + transaction.height) + "</span>",
        "</span>",
        '<span class="tx-feed-type"><span class="type-pill">' + escapeHtml(transaction.action) + "</span><small>" + escapeHtml(amount) + "</small></span>",
        '<span class="tx-feed-block mono">#' + escapeHtml(formatInteger(transaction.height)) + "</span>",
        "</a>",
      ].join("");
    }).join("") + "</div>";
  }

  async function renderDashboard() {
    const results = await Promise.all([
      fetchBlocks(8),
      fetchTransactions(8),
      rest("cosmos/bank/v1beta1/supply/by_denom", { denom: CONFIG.denom }),
      fetchValidators(),
      evm("eth_blockNumber", []),
      evm("eth_gasPrice", []),
    ]);
    const blockData = results[0];
    const txData = results[1];
    const supply = results[2].amount || { amount: "0" };
    const validators = results[3];
    const evmHeight = Number(hexToBigInt(results[4]));
    const gasPrice = results[5];
    const sync = blockData.status.sync_info;
    const latest = blockData.blocks[0];
    const blockTime = averageBlockTime(blockData.blocks);
    const txsInWindow = blockData.blocks.reduce(function (total, block) {
      return total + number(block.num_txs);
    }, 0);

    app.innerHTML = [
      '<section class="hero-panel">',
      '<div class="hero-copy">',
      '<span class="eyebrow">IPI network explorer</span>',
      '<h1>See every move on <span class="gradient-text">IPI Testnet.</span></h1>',
      "<p>Explore blocks, native and EVM transactions, accounts, balances, and validators directly from the live chain.</p>",
      '<div class="hero-badges">',
      '<span class="badge good">● Chain online</span>',
      '<span class="badge">' + escapeHtml(CONFIG.chainId) + "</span>",
      '<span class="badge">EVM ' + escapeHtml(CONFIG.evmChainId) + "</span>",
      '<span class="badge ' + (sync.catching_up ? "warn" : "good") + '">' + (sync.catching_up ? "Synchronizing" : "Fully synchronized") + "</span>",
      "</div>",
      "</div>",
      '<div class="hero-chain">',
      "<small>Latest block</small>",
      '<strong class="hero-height">' + escapeHtml(formatInteger(sync.latest_block_height)) + "</strong>",
      '<div class="chain-progress"><span></span></div>',
      '<span class="hash mono">' + escapeHtml(shorten(sync.latest_block_hash, 14, 11)) + "</span>",
      '<span class="subline">' + escapeHtml(formatDate(sync.latest_block_time)) + "</span>",
      "</div>",
      "</section>",
      '<section class="metric-grid">',
      metricCard("Average block time", formatDuration(blockTime), "Last " + blockData.blocks.length + " blocks", ""),
      metricCard("Transactions", formatInteger(txData.total), txsInWindow + " in current window", "purple"),
      metricCard("Total supply", formatIpi(supply.amount, true), "Zero-inflation baseline", "green"),
      metricCard("Active validators", formatInteger(validators.length), "EVM block " + formatInteger(evmHeight), "red"),
      "</section>",
      '<section class="dashboard-grid">',
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Latest blocks</h2><p>Fresh consensus activity</p></div><a class="text-link" href="#/blocks">View all</a></header>',
      blockRows(blockData.blocks.slice(0, 7)),
      "</article>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Latest transactions</h2><p>Most recent indexed activity</p></div><a class="text-link" href="#/transactions">View all</a></header>',
      compactTxRows(txData.transactions.slice(0, 7)),
      "</article>",
      '<article class="panel full">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Network snapshot</h2><p>Native and EVM runtime status</p></div><a class="text-link" href="https://status-testnet.ipi.io/">System status</a></header>',
      '<div class="detail-list">',
      detailRow("Chain ID", CONFIG.chainId, true),
      detailRow("EVM chain ID", String(CONFIG.evmChainId), true),
      detailRow("EVM latest block", formatInteger(evmHeight), true),
      detailRow("EVM gas price", formatGwei(gasPrice), false),
      detailRow("Node moniker", blockData.status.node_info.moniker || "—", false),
      detailRow("Validator voting power", blockData.status.validator_info.voting_power || "—", true),
      "</div>",
      "</article>",
      "</section>",
    ].join("");
  }

  async function renderBlocks(route) {
    const before = route.query.get("before");
    const data = await fetchBlocks(30, before);
    const hasNewer = data.max < data.latest;
    const olderBefore = Math.max(1, data.min - 1);
    const newerBefore = Math.min(data.latest, data.max + 30);
    app.innerHTML = [
      pageHead("Consensus", "Blocks", "Browse the latest finalized IPI Testnet blocks.", "Live RPC data"),
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Block range</h2><p>#' + escapeHtml(formatInteger(data.max)) + " to #" + escapeHtml(formatInteger(data.min)) + "</p></div></header>",
      blockRows(data.blocks),
      '<div class="pagination">',
      '<button class="page-button" data-href="#/blocks?before=' + encodePath(newerBefore) + '"' + (hasNewer ? "" : " disabled") + ">← Newer</button>",
      "<span>Latest block #" + escapeHtml(formatInteger(data.latest)) + "</span>",
      '<button class="page-button" data-href="#/blocks?before=' + encodePath(olderBefore) + '"' + (data.min <= 1 ? " disabled" : "") + ">Older →</button>",
      "</div>",
      "</article>",
    ].join("");
  }

  async function renderBlock(height) {
    if (!/^[0-9]+$/.test(height)) {
      throw new Error("Block height must be a positive integer.");
    }
    const results = await Promise.all([
      rpc("block", { height: height }),
      rpc("block_results", { height: height }),
      fetchTransactions(100, "tx.height=" + height),
    ]);
    const block = results[0].result;
    const blockResults = results[1].result;
    const txs = results[2].transactions;
    const header = block.block.header;
    const blockId = block.block_id;
    const proposer = header.proposer_address || "—";
    app.innerHTML = [
      pageHead("Block details", "Block #" + formatInteger(height), "Finalized block on " + CONFIG.chainId + ".", relativeTime(header.time)),
      '<section class="details-grid">',
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Block information</h2><p>Header and consensus metadata</p></div><span class="status-pill success">Finalized</span></header>',
      '<div class="detail-list">',
      detailRow("Height", header.height, true),
      detailRow("Timestamp", formatDate(header.time), false),
      detailRow("Block hash", blockId.hash, true, true),
      detailRow("Proposer", proposer, true, true),
      detailRow("Transactions", String((block.block.data.txs || []).length), true),
      detailRow("Block size", formatInteger(JSON.stringify(block.block).length) + " bytes", false),
      detailRow("App hash", header.app_hash, true, true),
      detailRow("Validators hash", header.validators_hash, true, true),
      detailRow("Consensus hash", header.consensus_hash, true, true),
      "</div>",
      "</article>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Execution</h2><p>Finalize block result</p></div></header>',
      '<div class="detail-list">',
      detailRow("Transaction results", String((blockResults.txs_results || []).length), true),
      detailRow("Validator updates", String((blockResults.validator_updates || []).length), true),
      detailRow("Consensus updates", blockResults.consensus_param_updates ? "Present" : "None", false),
      "</div>",
      "</article>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Navigation</h2><p>Adjacent heights</p></div></header>',
      '<div class="balance-list">',
      '<a class="action-button" href="#/block/' + encodePath(Math.max(1, number(height) - 1)) + '">← Previous block</a>',
      '<a class="action-button" href="#/block/' + encodePath(number(height) + 1) + '">Next block →</a>',
      "</div>",
      "</article>",
      "</section>",
      '<article class="panel" style="margin-top:18px">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Transactions</h2><p>' + escapeHtml(txs.length) + " transaction(s) in this block</p></div></header>",
      txRows(txs),
      "</article>",
    ].join("");
  }

  async function renderTransactions() {
    const data = await fetchTransactions(50);
    app.innerHTML = [
      pageHead("On-chain activity", "Transactions", "Latest indexed Cosmos and Cosmos EVM transactions.", formatInteger(data.total) + " total"),
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Latest transactions</h2><p>Ordered from newest to oldest</p></div></header>',
      txRows(data.transactions),
      "</article>",
    ].join("");
  }

  async function renderTransaction(hash) {
    const normalized = String(hash).replace(/^0x/i, "").toUpperCase();
    if (!/^[A-F0-9]{64}$/.test(normalized)) {
      throw new Error("A native transaction hash must contain 64 hexadecimal characters.");
    }
    const payload = await rpc("tx", { hash: "0x" + normalized, prove: "false" });
    const summary = txSummary(payload.result);
    const time = await fetchBlockTime(summary.height);
    const amount = summary.amount ? formatCoin(summary.amount, false) : "—";
    const fee = summary.fee ? formatCoin(summary.fee, false) : "—";
    app.innerHTML = [
      pageHead("Transaction details", shorten(summary.hash, 16, 12), "Native transaction on " + CONFIG.chainId + ".", time ? relativeTime(time) : ""),
      '<section class="details-grid">',
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Transaction receipt</h2><p>Execution and transfer details</p></div><span class="status-pill ' + (summary.code === 0 ? "success" : "failed") + '">' + (summary.code === 0 ? "Success" : "Failed") + "</span></header>",
      '<div class="detail-list">',
      detailRow("Transaction hash", summary.hash, true, true),
      detailRow("Block", '<a class="primary-link mono" href="#/block/' + encodePath(summary.height) + '">#' + escapeHtml(formatInteger(summary.height)) + "</a>", false, false, true),
      detailRow("Timestamp", formatDate(time), false),
      detailRow("Type", summary.action, false),
      detailRow("From", addressMarkup(summary.sender), false, false, true),
      detailRow("To", addressMarkup(summary.recipient), false, false, true),
      detailRow("Amount", '<span class="amount">' + escapeHtml(amount) + "</span>", false, false, true),
      detailRow("Fee", fee, false),
      detailRow("Gas used", formatInteger(summary.gasUsed) + " / " + formatInteger(summary.gasWanted), true),
      summary.log ? detailRow("Log", summary.log, false) : "",
      "</div>",
      "</article>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Execution status</h2><p>CometBFT result</p></div></header>',
      '<div class="detail-list">',
      detailRow("Code", String(summary.code), true),
      detailRow("Events", String(summary.events.length), true),
      detailRow("Indexed", "Yes", false),
      "</div>",
      "</article>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Raw events</h2><p>RPC event log</p></div></header>',
      '<pre class="json">' + escapeHtml(JSON.stringify(summary.events, null, 2)) + "</pre>",
      "</article>",
      "</section>",
    ].join("");
  }

  function addressMarkup(address) {
    if (!address) {
      return "—";
    }
    return '<a class="address-link mono" href="#/address/' + encodePath(address) + '">' + escapeHtml(address) + "</a>";
  }

  async function renderAddress(address) {
    if (!/^ipi1[0-9a-z]+$/i.test(address)) {
      throw new Error("This does not look like a valid IPI account address.");
    }
    const balanceResult = await rest("cosmos/bank/v1beta1/balances/" + encodePath(address));
    const accountResult = await Promise.allSettled([
      rest("cosmos/auth/v1beta1/accounts/" + encodePath(address)),
      fetchTransactions(20, "message.sender='" + address + "'"),
      fetchTransactions(20, "transfer.recipient='" + address + "'"),
    ]);
    const account =
      accountResult[0].status === "fulfilled" ? accountResult[0].value.account : null;
    const sent =
      accountResult[1].status === "fulfilled" ? accountResult[1].value.transactions : [];
    const received =
      accountResult[2].status === "fulfilled" ? accountResult[2].value.transactions : [];
    const merged = new Map();
    sent.concat(received).forEach(function (transaction) {
      merged.set(transaction.hash, transaction);
    });
    const transactions = Array.from(merged.values()).sort(function (a, b) {
      return number(b.height) - number(a.height);
    });
    const balances = balanceResult.balances || [];
    const native = balances.find(function (coin) { return coin.denom === CONFIG.denom; });
    const baseAccount = account && (account.base_account || account.base_vesting_account || account);

    app.innerHTML = [
      '<header class="page-head"><div class="big-address">',
      '<span class="identicon">' + escapeHtml(address.slice(3, 5).toUpperCase()) + "</span>",
      "<div><span class=\"eyebrow\">Account</span><h1 title=\"" + escapeHtml(address) + "\">" + escapeHtml(address) + "</h1><p>IPI native account</p></div>",
      "</div></header>",
      '<section class="metric-grid">',
      metricCard("Available balance", native ? formatIpi(native.amount, false) : "0 IPI", CONFIG.denom, ""),
      metricCard("Transactions found", formatInteger(transactions.length), "Recent indexed activity", "purple"),
      metricCard("Account number", baseAccount && baseAccount.account_number ? baseAccount.account_number : "—", "On-chain account", "green"),
      metricCard("Sequence", baseAccount && baseAccount.sequence ? baseAccount.sequence : "—", "Next transaction nonce", "red"),
      "</section>",
      '<section class="dashboard-grid">',
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Balances</h2><p>All bank module balances</p></div></header>',
      '<div class="balance-list">',
      balances.length ? balances.map(function (coin) {
        return '<div class="balance-row"><span class="mono">' + escapeHtml(coin.denom) + '</span><strong>' + escapeHtml(coin.denom === CONFIG.denom ? formatIpi(coin.amount, false) : coin.amount) + "</strong></div>";
      }).join("") : '<div class="empty-state"><div><span class="empty-icon">○</span><h2>Empty account</h2><p>No bank balances were returned.</p></div></div>',
      "</div>",
      "</article>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Account metadata</h2><p>Auth module record</p></div><button class="copy-button" data-copy="' + escapeHtml(address) + '">Copy address</button></header>',
      '<div class="detail-list">',
      detailRow("Address", address, true, true),
      detailRow("Type", account && account["@type"] ? account["@type"] : "Base account", false),
      detailRow("Account number", baseAccount && baseAccount.account_number ? baseAccount.account_number : "—", true),
      detailRow("Sequence", baseAccount && baseAccount.sequence ? baseAccount.sequence : "—", true),
      "</div>",
      "</article>",
      '<article class="panel full">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Recent activity</h2><p>Transactions sent or received by this account</p></div></header>',
      txRows(transactions),
      "</article>",
      "</section>",
    ].join("");
  }

  async function renderValidators() {
    const validators = await fetchValidators();
    const totalTokens = validators.reduce(function (total, validator) {
      try {
        return total + BigInt(validator.tokens || "0");
      } catch (error) {
        return total;
      }
    }, 0n);
    app.innerHTML = [
      pageHead("Consensus set", "Validators", "Active validators securing " + CONFIG.chainId + ".", formatInteger(validators.length) + " bonded"),
      '<section class="metric-grid">',
      metricCard("Bonded validators", formatInteger(validators.length), "Active consensus set", ""),
      metricCard("Bonded voting stake", formatIpi(totalTokens.toString(), true), "Validator tokens", "purple"),
      metricCard("Jailed", formatInteger(validators.filter(function (v) { return v.jailed; }).length), "Within bonded set", "red"),
      metricCard("Network", CONFIG.chainId, "CometBFT consensus", "green"),
      "</section>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Active validator set</h2><p>Bonded staking validators</p></div></header>',
      '<div class="validator-list">',
      validators.length ? validators.map(function (validator) {
        const rate = number(validator.commission && validator.commission.commission_rates && validator.commission.commission_rates.rate) * 100;
        return [
          '<a class="validator-card" href="#/validator/' + encodePath(validator.operator_address) + '" style="text-decoration:none;color:inherit">',
          '<div class="validator-cell"><span class="identicon" style="width:44px;height:44px;border-radius:13px">' + escapeHtml((validator.description.moniker || "V").slice(0, 2).toUpperCase()) + '</span><div><strong>' + escapeHtml(validator.description.moniker || "Unnamed validator") + '</strong><span class="subline mono">' + escapeHtml(shorten(validator.operator_address, 13, 8)) + "</span></div></div>",
          '<div><small>Voting stake</small><strong>' + escapeHtml(formatIpi(validator.tokens, true)) + "</strong></div>",
          '<div><small>Commission</small><strong>' + escapeHtml(rate.toFixed(1)) + "%</strong></div>",
          "</a>",
        ].join("");
      }).join("") : '<div class="empty-state"><div><span class="empty-icon">◎</span><h2>No validators returned</h2><p>The staking endpoint returned an empty bonded set.</p></div></div>',
      "</div>",
      "</article>",
    ].join("");
  }

  async function renderValidator(operatorAddress) {
    const payload = await rest("cosmos/staking/v1beta1/validators/" + encodePath(operatorAddress));
    const validator = payload.validator;
    if (!validator) {
      throw new Error("Validator not found.");
    }
    const rate = number(validator.commission.commission_rates.rate) * 100;
    app.innerHTML = [
      '<header class="page-head"><div class="big-address">',
      '<span class="identicon">' + escapeHtml((validator.description.moniker || "V").slice(0, 2).toUpperCase()) + "</span>",
      "<div><span class=\"eyebrow\">Validator</span><h1>" + escapeHtml(validator.description.moniker || "Unnamed validator") + "</h1><p class=\"mono\">" + escapeHtml(operatorAddress) + "</p></div>",
      "</div></header>",
      '<section class="metric-grid">',
      metricCard("Voting stake", formatIpi(validator.tokens, true), "Bonded tokens", ""),
      metricCard("Commission", rate.toFixed(2) + "%", "Current rate", "purple"),
      metricCard("Status", validator.status.replace("BOND_STATUS_", ""), validator.jailed ? "Jailed" : "Not jailed", validator.jailed ? "red" : "green"),
      metricCard("Min self delegation", validator.min_self_delegation || "1", "Validator setting", "red"),
      "</section>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Validator details</h2><p>Staking module metadata</p></div></header>',
      '<div class="detail-list">',
      detailRow("Operator address", validator.operator_address, true, true),
      detailRow("Moniker", validator.description.moniker || "—", false),
      detailRow("Website", validator.description.website || "—", false),
      detailRow("Details", validator.description.details || "—", false),
      detailRow("Status", validator.status, true),
      detailRow("Jailed", validator.jailed ? "Yes" : "No", false),
      detailRow("Tokens", formatIpi(validator.tokens, false), false),
      detailRow("Delegator shares", validator.delegator_shares, true),
      detailRow("Max commission", (number(validator.commission.commission_rates.max_rate) * 100).toFixed(2) + "%", false),
      "</div>",
      "</article>",
    ].join("");
  }

  async function renderEvmTransaction(hash) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      throw new Error("An EVM transaction hash must start with 0x and contain 64 hexadecimal characters.");
    }
    const results = await Promise.all([
      evm("eth_getTransactionByHash", [hash]),
      evm("eth_getTransactionReceipt", [hash]),
    ]);
    const transaction = results[0];
    const receipt = results[1];
    if (!transaction) {
      throw new Error("EVM transaction not found.");
    }
    const block = transaction.blockNumber
      ? await evm("eth_getBlockByNumber", [transaction.blockNumber, false])
      : null;
    const success = receipt && receipt.status === "0x1";
    app.innerHTML = [
      pageHead("EVM transaction", shorten(hash, 16, 12), "Ethereum-compatible transaction on chain " + CONFIG.evmChainId + ".", block ? formatDate(Number(hexToBigInt(block.timestamp)) * 1000) : "Pending"),
      '<section class="details-grid">',
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Transaction receipt</h2><p>EVM execution details</p></div><span class="status-pill ' + (success ? "success" : "failed") + '">' + (success ? "Success" : "Failed / pending") + "</span></header>",
      '<div class="detail-list">',
      detailRow("Hash", hash, true, true),
      detailRow("Block", transaction.blockNumber ? formatInteger(Number(hexToBigInt(transaction.blockNumber))) : "Pending", true),
      detailRow("From", evmAddressMarkup(transaction.from), false, false, true),
      detailRow("To", evmAddressMarkup(transaction.to), false, false, true),
      detailRow("Value", formatUnits(hexToBigInt(transaction.value).toString(), 18, "IPI", false), false),
      detailRow("Nonce", formatInteger(Number(hexToBigInt(transaction.nonce))), true),
      detailRow("Gas limit", formatInteger(Number(hexToBigInt(transaction.gas))), true),
      detailRow("Gas used", receipt ? formatInteger(Number(hexToBigInt(receipt.gasUsed))) : "—", true),
      detailRow("Gas price", formatGwei(transaction.gasPrice || transaction.maxFeePerGas), false),
      detailRow("Input bytes", formatInteger(Math.max(0, (transaction.input || "0x").length - 2) / 2), true),
      "</div>",
      "</article>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>EVM runtime</h2><p>Ethereum compatibility layer</p></div></header>',
      '<div class="detail-list">',
      detailRow("Chain ID", String(CONFIG.evmChainId), true),
      detailRow("Transaction index", receipt ? String(Number(hexToBigInt(receipt.transactionIndex))) : "—", true),
      detailRow("Contract created", receipt && receipt.contractAddress ? evmAddressMarkup(receipt.contractAddress) : "No", false, false, true),
      "</div>",
      "</article>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>Logs</h2><p>Contract event count</p></div></header>',
      '<div class="detail-list">' + detailRow("Logs emitted", receipt && receipt.logs ? String(receipt.logs.length) : "0", true) + "</div>",
      "</article>",
      "</section>",
    ].join("");
  }

  function evmAddressMarkup(address) {
    if (!address) {
      return "Contract creation";
    }
    return '<a class="address-link mono" href="#/evm-address/' + encodePath(address) + '">' + escapeHtml(address) + "</a>";
  }

  async function renderEvmAddress(address) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error("An EVM address must start with 0x and contain 40 hexadecimal characters.");
    }
    const results = await Promise.all([
      evm("eth_getBalance", [address, "latest"]),
      evm("eth_getTransactionCount", [address, "latest"]),
      evm("eth_getCode", [address, "latest"]),
      evm("eth_blockNumber", []),
    ]);
    const isContract = results[2] && results[2] !== "0x";
    app.innerHTML = [
      '<header class="page-head"><div class="big-address">',
      '<span class="identicon">0x</span>',
      "<div><span class=\"eyebrow\">EVM " + (isContract ? "contract" : "account") + "</span><h1 title=\"" + escapeHtml(address) + "\">" + escapeHtml(address) + "</h1><p>Chain ID " + escapeHtml(CONFIG.evmChainId) + "</p></div>",
      "</div></header>",
      '<section class="metric-grid">',
      metricCard("Balance", formatUnits(hexToBigInt(results[0]).toString(), 18, "IPI", false), "EVM native balance", ""),
      metricCard("Nonce", formatInteger(Number(hexToBigInt(results[1]))), "Sent transaction count", "purple"),
      metricCard("Account type", isContract ? "Contract" : "Externally owned", isContract ? formatInteger((results[2].length - 2) / 2) + " byte code" : "No bytecode", "green"),
      metricCard("Latest EVM block", formatInteger(Number(hexToBigInt(results[3]))), "Live JSON-RPC", "red"),
      "</section>",
      '<article class="panel">',
      '<header class="panel-head"><div class="panel-head-copy"><h2>EVM account details</h2><p>Live state from JSON-RPC</p></div><button class="copy-button" data-copy="' + escapeHtml(address) + '">Copy address</button></header>',
      '<div class="detail-list">',
      detailRow("Address", address, true, true),
      detailRow("Balance (wei)", hexToBigInt(results[0]).toString(), true),
      detailRow("Nonce", String(Number(hexToBigInt(results[1]))), true),
      detailRow("Has bytecode", isContract ? "Yes" : "No", false),
      "</div>",
      "</article>",
      '<div class="callout" style="margin-top:18px"><strong>Transaction history:</strong> complete EVM address history requires the PostgreSQL-backed indexer saved in the project backlog. Live balance, nonce, bytecode, blocks, and direct transaction hashes work now.</div>',
    ].join("");
  }

  function detailRow(label, value, mono, copy, rawHtml) {
    const rendered = rawHtml ? String(value || "—") : escapeHtml(value || "—");
    const copyButton = copy && value
      ? '<button class="copy-button" data-copy="' + escapeHtml(value) + '">Copy</button>'
      : "";
    return [
      '<div class="detail-row">',
      '<span class="detail-label">' + escapeHtml(label) + "</span>",
      '<span class="detail-value' + (mono ? " mono" : "") + '">' + rendered + copyButton + "</span>",
      "</div>",
    ].join("");
  }

  function routeInfo() {
    const raw = (window.location.hash || "#/").slice(1);
    const parts = raw.split("?");
    const path = parts[0] || "/";
    return {
      path: path,
      segments: path.split("/").filter(Boolean),
      query: new URLSearchParams(parts[1] || ""),
    };
  }

  function setActiveNavigation(route) {
    const base = route.segments[0] || "";
    document.querySelectorAll(".main-nav a[data-route]").forEach(function (link) {
      const expected = link.getAttribute("data-route").replace(/^\//, "");
      link.classList.toggle("active", expected === base || (!expected && !base));
    });
  }

  function setNavigationOpen(open) {
    document.body.classList.toggle("nav-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  }

  function closeNavigation() {
    setNavigationOpen(false);
  }

  async function navigate() {
    const route = routeInfo();
    setActiveNavigation(route);
    closeNavigation();
    setLoading();
    app.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
    try {
      const section = route.segments[0] || "";
      if (!section) {
        await renderDashboard();
      } else if (section === "blocks") {
        await renderBlocks(route);
      } else if (section === "block" && route.segments[1]) {
        await renderBlock(route.segments[1]);
      } else if (section === "transactions") {
        await renderTransactions();
      } else if (section === "tx" && route.segments[1]) {
        await renderTransaction(decodeURIComponent(route.segments[1]));
      } else if (section === "address" && route.segments[1]) {
        await renderAddress(decodeURIComponent(route.segments[1]));
      } else if (section === "validators") {
        await renderValidators();
      } else if (section === "validator" && route.segments[1]) {
        await renderValidator(decodeURIComponent(route.segments[1]));
      } else if (section === "evm-tx" && route.segments[1]) {
        await renderEvmTransaction(decodeURIComponent(route.segments[1]));
      } else if (section === "evm-address" && route.segments[1]) {
        await renderEvmAddress(decodeURIComponent(route.segments[1]));
      } else {
        throw new Error("This explorer route does not exist.");
      }
    } catch (error) {
      console.error(error);
      renderError("Unable to load explorer data", error);
    }
  }

  function setSearchBusy(busy) {
    const submit = searchForm.querySelector('button[type="submit"]');
    searchForm.setAttribute("aria-busy", busy ? "true" : "false");
    searchInput.setAttribute("aria-busy", busy ? "true" : "false");
    if (submit) {
      submit.disabled = busy;
      submit.textContent = busy ? "Searching…" : "Search";
    }
  }

  function openSearchResult(hash) {
    if (window.location.hash === hash) {
      navigate();
      return;
    }
    window.location.hash = hash;
  }

  async function findNativeTransaction(hash) {
    try {
      const payload = await rpc("tx", { hash: "0x" + hash, prove: "false" });
      return payload.result && payload.result.hash ? payload.result : null;
    } catch (error) {
      return null;
    }
  }

  async function findNativeBlock(hash) {
    try {
      const payload = await rpc("block_by_hash", { hash: "0x" + hash });
      return payload.result && payload.result.block ? payload.result : null;
    } catch (error) {
      return null;
    }
  }

  async function findEvmTransaction(hash) {
    try {
      return await evm("eth_getTransactionByHash", [hash]);
    } catch (error) {
      return null;
    }
  }

  async function findEvmBlock(hash) {
    try {
      return await evm("eth_getBlockByHash", [hash, false]);
    } catch (error) {
      return null;
    }
  }

  async function resolveHashSearch(query) {
    const explicitEvm = /^0x/i.test(query);
    const clean = query.replace(/^0x/i, "");
    const nativeHash = clean.toUpperCase();
    const evmHash = "0x" + clean.toLowerCase();
    const results = await Promise.all([
      findNativeTransaction(nativeHash),
      findNativeBlock(nativeHash),
      findEvmTransaction(evmHash),
      findEvmBlock(evmHash),
    ]);

    if (explicitEvm && results[2]) {
      return "#/evm-tx/" + encodePath(evmHash);
    }
    if (results[0]) {
      return "#/tx/" + encodePath(nativeHash);
    }
    if (results[1]) {
      return "#/block/" + encodePath(results[1].block.header.height);
    }
    if (results[2]) {
      return "#/evm-tx/" + encodePath(evmHash);
    }
    if (results[3] && results[3].number) {
      return "#/block/" + encodePath(hexToBigInt(results[3].number).toString());
    }
    return "";
  }

  async function runSearch(value) {
    const query = String(value || "").trim();
    const sequence = ++searchSequence;
    if (!query) {
      showToast("Enter an address, transaction hash, or block height.");
      return;
    }
    const height = query.match(/^#?([0-9]{1,19})$/);
    if (height) {
      openSearchResult("#/block/" + encodePath(height[1]));
      return;
    }
    if (/^ipi1[0-9a-z]+$/i.test(query)) {
      openSearchResult("#/address/" + encodePath(query.toLowerCase()));
      return;
    }
    if (/^ipivaloper1[0-9a-z]+$/i.test(query)) {
      openSearchResult("#/validator/" + encodePath(query.toLowerCase()));
      return;
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(query)) {
      openSearchResult("#/evm-address/" + encodePath(query));
      return;
    }
    if (/^(?:0x)?[a-fA-F0-9]{64}$/.test(query)) {
      setSearchBusy(true);
      showToast("Checking transaction and block indexes…");
      try {
        const route = await resolveHashSearch(query);
        if (sequence !== searchSequence) {
          return;
        }
        if (route) {
          openSearchResult(route);
        } else {
          showToast("No transaction or block matches this hash.");
        }
      } finally {
        if (sequence === searchSequence) {
          setSearchBusy(false);
        }
      }
      return;
    }
    showToast("Search format not recognized.");
  }

  async function refreshSidebarStatus() {
    const network = document.getElementById("sidebar-network");
    const height = document.getElementById("sidebar-height");
    const sidebarDot = document.getElementById("sidebar-live-dot");
    const topbarStatus = document.getElementById("topbar-status");
    try {
      const status = await fetchStatus();
      network.textContent = status.node_info.network || CONFIG.chainId;
      height.textContent = formatInteger(status.sync_info.latest_block_height);
      sidebarDot.classList.remove("bad");
      topbarStatus.innerHTML = '<span class="live-dot"></span><span>Live</span>';
    } catch (error) {
      network.textContent = "RPC unavailable";
      height.textContent = "—";
      sidebarDot.classList.add("bad");
      topbarStatus.innerHTML = '<span class="live-dot bad"></span><span>Offline</span>';
    }
  }

  searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    void runSearch(searchInput.value);
  });

  menuButton.addEventListener("click", function () {
    setNavigationOpen(!document.body.classList.contains("nav-open"));
  });

  scrim.addEventListener("click", function () {
    closeNavigation();
  });

  sidebar.addEventListener("click", function (event) {
    if (event.target.closest("a")) {
      closeNavigation();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeNavigation();
    }
  });

  app.addEventListener("click", async function (event) {
    const copy = event.target.closest("[data-copy]");
    if (copy) {
      try {
        await navigator.clipboard.writeText(copy.getAttribute("data-copy"));
        showToast("Copied to clipboard.");
      } catch (error) {
        showToast("Clipboard access is unavailable.");
      }
      return;
    }
    const pager = event.target.closest("[data-href]");
    if (pager && !pager.disabled) {
      window.location.hash = pager.getAttribute("data-href");
      return;
    }
    if (event.target.closest("[data-reload]")) {
      navigate();
    }
  });

  window.addEventListener("hashchange", navigate);
  refreshSidebarStatus();
  setInterval(refreshSidebarStatus, 15000);
  navigate();
}());
