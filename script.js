/* MuMeVIS — linked TMAP chemical space + feature × sample matrix.
 * Data: csvjson.json (one row per feature occurrence in a sample),
 *       TmapData.js   (global `map_data`: TMAP node coordinates, labels and tree edges). */
(() => {
  "use strict";

  // ---------- encodings ----------
  // Colours come from the CSS tokens in style.css (:root).
  const UNCLASSIFIED = "Unclassified";
  const SUPERCLASSES = [
    { name: "Lipids and lipid-like molecules", short: "lipids", token: "--sc-lipids" },
    { name: "Organic acids and derivatives", short: "organic acids", token: "--sc-acids" },
    { name: "Phenylpropanoids and polyketides", short: "phenylpropanoids", token: "--sc-phenylpropanoids" },
    { name: "Benzenoids", short: "benzenoids", token: "--sc-benzenoids" },
    { name: "Organoheterocyclic compounds", short: "organoheterocyclics", token: "--sc-organoheterocyclic" },
    { name: "Organic nitrogen compounds", short: "organic nitrogen", token: "--sc-nitrogen" },
    { name: "Organic oxygen compounds", short: "organic oxygen", token: "--sc-oxygen" },
    { name: "Nucleosides, nucleotides, and analogues", short: "nucleosides", token: "--sc-nucleosides" },
    { name: "Alkaloids and derivatives", short: "alkaloids", token: "--sc-alkaloids" },
    { name: UNCLASSIFIED, short: "unclassified", token: "--sc-unclassified" },
  ];
  const SUPERCLASS_COLORS = new Map(SUPERCLASSES.map((s) => [s.name, getCss(s.token)]));
  SUPERCLASS_COLORS.set(UNCLASSIFIED, getCss("--paper")); // hollow: paper fill, ring stroke
  const confidenceColor = d3.scaleLinear().domain([0, 1])
    .range([getCss("--conf-lo"), getCss("--conf-hi")])
    .interpolate(d3.interpolateLab).clamp(true);

  const SAMPLES = [0, 1, 2];
  const sampleName = (i) => `Sample ${i + 1}`;

  const state = { colorBy: "superclass", sortBy: "index", hover: null };

  const isHollow = (f) => state.colorBy === "superclass" && f.superclass === UNCLASSIFIED;
  const colorOf = (f) => state.colorBy === "superclass"
    ? SUPERCLASS_COLORS.get(f.superclass)
    : confidenceColor(f.confidence);

  // ---------- TMAP geometry ----------
  const CS = map_data.Chemical_Space;
  const TREE = map_data.Chemical_Space_tree;
  const labelIndex = new Map(CS.labels.map((smiles, i) => [smiles, i]));
  const tmapExtentX = d3.extent(CS.x);
  const tmapExtentY = d3.extent(CS.y);

  // ---------- DOM ----------
  const mapBody = document.getElementById("map-body");
  const canvas = document.getElementById("map-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = d3.select("#map-overlay");
  const mapG = overlay.append("g");
  const matrixSvg = d3.select("#matrix");
  const tooltip = document.getElementById("tooltip");
  const toast = document.getElementById("toast");

  d3.json("csvjson.json").then((rows) => {
    // One feature per `index`; superclass and confidence are constant per feature across samples.
    const features = Array.from(d3.group(rows, (r) => r.index), ([index, occ]) => {
      const r = occ[0];
      const node = labelIndex.has(r.Smiles_GNPS_results) ? labelIndex.get(r.Smiles_GNPS_results) : -1;
      return {
        index,
        rec: r,
        samples: new Set(occ.map((o) => o.file_index)),
        superclass: r.cf_superclass_ms2query_results || UNCLASSIFIED,
        confidence: r.ms2query_model_prediction_ms2query_results,
        node,
        tx: node >= 0 ? CS.x[node] : null,
        ty: node >= 0 ? CS.y[node] : null,
      };
    }).sort((a, b) => a.index - b.index);

    const onMap = features.filter((f) => f.node >= 0);

    buildLegends(features);
    const map = createMap(onMap);
    const matrix = createMatrix(features);

    // ---------- shared interaction ----------
    function setHover(f, event) {
      state.hover = f ? f.index : null;
      map.highlight();
      matrix.highlight();
      if (f && event) showTooltip(f, event); else hideTooltip();
    }
    map.onHover = matrix.onHover = setHover;
    map.onClick = matrix.onClick = copyFeature;

    function recolor() { map.recolor(); matrix.recolor(); }

    // Colour encoding (legend cards double as the switch)
    d3.selectAll(".enc-card").on("click", function () {
      state.colorBy = this.dataset.enc;
      d3.selectAll(".enc-card").attr("aria-checked", function () { return this.dataset.enc === state.colorBy; });
      recolor();
    });

    // Matrix sort (only affects the matrix, so it lives in the matrix header)
    d3.selectAll("[data-sort]").on("click", function () {
      state.sortBy = this.dataset.sort;
      d3.selectAll("[data-sort]").attr("aria-checked", function () { return this.dataset.sort === state.sortBy; });
      matrix.sort(true);
    });

    document.getElementById("reset-zoom").addEventListener("click", map.resetZoom);

    window.addEventListener("resize", () => { map.resize(); matrix.resize(); });
  });

  // =====================================================================
  // Chemical-space view: canvas for the 20k-node TMAP, SVG for features.
  // =====================================================================
  function createMap(onMap) {
    const api = { onHover: () => {}, onClick: () => {} };
    let width = 0, height = 0, transform = d3.zoomIdentity;
    const x = d3.scaleLinear().domain(tmapExtentX);
    const y = d3.scaleLinear().domain(tmapExtentY);

    const zoom = d3.zoom()
      .scaleExtent([0.8, 40])
      .on("zoom", (event) => {
        transform = event.transform;
        mapG.attr("transform", transform);
        mapG.selectAll(".feature-dot")
          .attr("r", 5.5 / transform.k)
          .attr("stroke-width", 1.2 / transform.k);
        draw();
      });
    overlay.call(zoom).on("dblclick.zoom", null);

    let dots = mapG.selectAll(".feature-dot")
      .data(onMap, (f) => f.index)
      .join("circle")
      .attr("class", "feature-dot")
      .on("mouseenter mousemove", (event, f) => api.onHover(f, event))
      .on("mouseleave", () => api.onHover(null))
      .on("click", (event, f) => api.onClick(f));

    function resize() {
      const rect = mapBody.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fit the square TMAP layout into the panel, preserving aspect ratio; y points up.
      const pad = 24;
      const side = Math.max(10, Math.min(width, height) - 2 * pad);
      const ox = (width - side) / 2, oy = (height - side) / 2;
      x.range([ox, ox + side]);
      y.range([oy + side, oy]);

      dots.attr("cx", (f) => x(f.tx)).attr("cy", (f) => y(f.ty));
      draw();
    }

    function draw() {
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Tree edges (consecutive coordinate pairs are segment endpoints)
      ctx.beginPath();
      for (let i = 0; i + 1 < TREE.x.length; i += 2) {
        ctx.moveTo(x(TREE.x[i]), y(TREE.y[i]));
        ctx.lineTo(x(TREE.x[i + 1]), y(TREE.y[i + 1]));
      }
      ctx.strokeStyle = getCss("--tree");
      ctx.lineWidth = 0.6 / transform.k;
      ctx.stroke();

      // Nodes
      ctx.fillStyle = getCss("--tree");
      const s = 1.6 / transform.k;
      for (let i = 0; i < CS.x.length; i++) {
        ctx.fillRect(x(CS.x[i]) - s / 2, y(CS.y[i]) - s / 2, s, s);
      }
      ctx.restore();
    }

    api.recolor = () => dots.attr("fill", colorOf).classed("hollow", isHollow);
    api.highlight = () => {
      const h = state.hover;
      dots.classed("dim", (f) => h !== null && f.index !== h)
        .attr("stroke-width", (f) => (f.index === h ? 2.5 : 1.2) / transform.k);
      if (h !== null) dots.filter((f) => f.index === h).raise();
    };
    api.resize = resize;
    api.resetZoom = () => overlay.transition().duration(400).call(zoom.transform, d3.zoomIdentity);

    dots.attr("r", 5.5).attr("stroke-width", 1.2);
    resize();
    api.recolor();
    return api;
  }

  // =====================================================================
  // Matrix view: rows = features, columns = samples, cell = presence.
  // =====================================================================
  function createMatrix(features) {
    const api = { onHover: () => {}, onClick: () => {} };
    const margin = { top: 46, right: 14, bottom: 12, left: 14 };
    const flagW = 34;
    const byIndex = new Map(features.map((f) => [f.index, f]));
    const cellsData = features.flatMap((f) => [...f.samples].map((s) => ({ f, s })));
    const sampleCounts = SAMPLES.map((s) => features.filter((f) => f.samples.has(s)).length);

    const xCol = d3.scaleBand().domain(SAMPLES).paddingInner(0.1);
    const yRow = d3.scaleBand().paddingInner(0.18);

    const root = matrixSvg.append("g");
    const header = root.append("g");
    const tracks = root.append("g");
    const flags = root.append("g");
    const cellsG = root.append("g");
    const highlightRect = root.append("rect").attr("class", "row-highlight").style("display", "none");
    const hit = root.append("rect").attr("fill", "transparent").style("cursor", "pointer");

    let cells = cellsG.selectAll("rect").data(cellsData).join("rect")
      .attr("class", (d) => "cell" + (d.f.superclass === UNCLASSIFIED ? " unclassified" : ""));

    const mapFlags = flags.selectAll("circle")
      .data(features.filter((f) => f.node >= 0)).join("circle")
      .attr("class", "map-flag");

    function order() {
      const sorted = features.slice();
      if (state.sortBy === "confidence") sorted.sort((a, b) => d3.descending(a.confidence, b.confidence) || a.index - b.index);
      return sorted.map((f) => f.index);
    }

    function layout(animate) {
      const rect = matrixSvg.node().getBoundingClientRect();
      const w = rect.width, h = rect.height;
      xCol.range([margin.left + flagW, w - margin.right]);
      yRow.domain(order()).range([margin.top, h - margin.bottom]);

      header.selectAll("g.col").data(SAMPLES).join((enter) => {
        const g = enter.append("g").attr("class", "col");
        g.append("text").attr("class", "col-label");
        g.append("text").attr("class", "col-sub");
        return g;
      })
        .attr("transform", (s) => `translate(${xCol(s)},0)`)
        .call((g) => g.select(".col-label").attr("y", 18).text(sampleName))
        .call((g) => g.select(".col-sub").attr("y", 34).text((s) => `${sampleCounts[s]} features`));

      header.selectAll("text.flag-label").data([0]).join("text")
        .attr("class", "col-sub flag-label")
        .attr("x", margin.left + flagW / 2 - 6).attr("y", 34).attr("text-anchor", "middle")
        .text("map");

      tracks.selectAll("rect").data(SAMPLES).join("rect")
        .attr("class", "track")
        .attr("x", (s) => xCol(s)).attr("y", margin.top)
        .attr("width", xCol.bandwidth()).attr("height", Math.max(0, h - margin.top - margin.bottom));

      const t = animate ? matrixSvg.transition().duration(600) : null;
      const target = (sel) => (t ? sel.transition(t) : sel);

      target(cells)
        .attr("x", (d) => xCol(d.s)).attr("width", xCol.bandwidth())
        .attr("y", (d) => yRow(d.f.index)).attr("height", yRow.bandwidth());

      target(mapFlags)
        .attr("cx", margin.left + flagW / 2 - 6)
        .attr("cy", (f) => yRow(f.index) + yRow.bandwidth() / 2)
        .attr("r", Math.min(2.5, yRow.bandwidth() / 2));

      hit.attr("x", margin.left).attr("y", margin.top)
        .attr("width", Math.max(0, w - margin.left - margin.right))
        .attr("height", Math.max(0, h - margin.top - margin.bottom));

      api.highlight();
    }

    function featureAt(event) {
      const [, my] = d3.pointer(event, matrixSvg.node());
      const step = yRow.step();
      const i = Math.floor((my - yRow.range()[0] - yRow.paddingOuter() * step) / step);
      const dom = yRow.domain();
      return i >= 0 && i < dom.length ? byIndex.get(dom[i]) : null;
    }

    hit.on("mousemove", (event) => api.onHover(featureAt(event), event))
      .on("mouseleave", () => api.onHover(null))
      .on("click", (event) => { const f = featureAt(event); if (f) api.onClick(f); });

    api.recolor = () => cells.attr("fill", (d) => colorOf(d.f)).classed("unclassified", (d) => isHollow(d.f));
    api.highlight = () => {
      const h = state.hover;
      if (h === null) { highlightRect.style("display", "none"); return; }
      const pad = 1.5;
      highlightRect.style("display", null)
        .attr("x", xCol.range()[0] - pad)
        .attr("y", yRow(h) - pad)
        .attr("width", xCol.range()[1] - xCol.range()[0] + 2 * pad)
        .attr("height", yRow.bandwidth() + 2 * pad);
    };
    api.sort = (animate) => layout(animate);
    api.resize = () => layout(false);

    layout(false);
    api.recolor();
    return api;
  }

  // =====================================================================
  // Legends: two visually distinct forms for two different encodings.
  // =====================================================================
  function buildLegends(features) {
    const counts = d3.rollup(features, (v) => v.length, (f) => f.superclass);
    const sw = d3.select("#legend-superclass").append("span").attr("class", "swatches");
    const items = sw.selectAll(".swatch")
      .data([...SUPERCLASS_COLORS].filter(([name]) => counts.has(name)))
      .join("span").attr("class", "swatch");
    items.append("i").style("background", ([, c]) => c);
    items.append("span").attr("class", "label").text(([name]) => name).attr("title", ([name]) => name);
    items.append("span").attr("class", "count").text(([name]) => counts.get(name));

    drawRamp(features);
    window.addEventListener("resize", () => drawRamp(features));
  }

  // Continuous ramp with axis and the observed data range, drawn at true pixel size.
  function drawRamp(features) {
    const host = d3.select("#legend-confidence");
    host.selectAll("*").remove();
    const W = Math.max(160, host.node().getBoundingClientRect().width), H = 50, m = { l: 8, r: 12 };
    const svg = host.append("svg").attr("class", "ramp").attr("width", W).attr("height", H);
    const gid = "conf-gradient";
    const grad = svg.append("defs").append("linearGradient").attr("id", gid);
    d3.range(0, 1.0001, 0.1).forEach((t) => grad.append("stop").attr("offset", t).attr("stop-color", confidenceColor(t)));

    const sx = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
    const [lo, hi] = d3.extent(features, (f) => f.confidence);

    svg.append("rect").attr("x", sx(0)).attr("y", 18).attr("width", sx(1) - sx(0)).attr("height", 12)
      .attr("fill", `url(#${gid})`).attr("stroke", "rgba(0,0,0,0.25)");
    svg.append("g").attr("transform", "translate(0,30)")
      .call(d3.axisBottom(sx).ticks(5).tickSize(4).tickFormat(d3.format(".1f")))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("line").attr("stroke", "#999"));

    svg.append("path")
      .attr("d", `M${sx(lo)},16 V11 H${sx(hi)} V16`).attr("fill", "none").attr("stroke", "#6b6b66");
    svg.append("text").attr("x", (sx(lo) + sx(hi)) / 2).attr("y", 8).attr("text-anchor", "middle")
      .text(`observed in data: ${d3.format(".2f")(lo)}–${d3.format(".2f")(hi)}`);
  }

  // =====================================================================
  // Tooltip, copy-to-clipboard
  // =====================================================================
  let lastTipFor = null;
  function showTooltip(f, event) {
    const r = f.rec;
    if (lastTipFor !== f.index) {
      lastTipFor = f.index;
      const fmt = (v) => (v === "" || v === null || v === undefined ? "—" : v);
      const present = SAMPLES.filter((s) => f.samples.has(s)).map(sampleName).join(", ");
      tooltip.innerHTML = `
        <h3>${escapeHtml(fmt(r.Compound_Name_GNPS_results))}</h3>
        <dl>
          <dt>Feature</dt><dd>#${f.index} · query spectrum ${fmt(r.query_spectrum_nr)}</dd>
          <dt>Present in</dt><dd>${present}</dd>
          <dt>Analogue</dt><dd>${escapeHtml(fmt(r.analog_compound_name_ms2query_results))}</dd>
          <dt>Confidence</dt><dd>${d3.format(".3f")(f.confidence)}</dd>
          <dt>Superclass</dt><dd>${escapeHtml(f.superclass)}</dd>
          <dt>Class</dt><dd>${escapeHtml(fmt(r.cf_class_ms2query_results))}</dd>
          <dt>NPC pathway</dt><dd>${escapeHtml(fmt(r.npc_pathway_results_ms2query_results))}</dd>
          <dt>Spectrum ID</dt><dd>${escapeHtml(fmt(r.spectrum_ids_ms2query_results))}</dd>
          <dt>Mass diff.</dt><dd>${fmt(r.MassDiff_GNPS_results)}</dd>
        </dl>
        ${r.Smiles_GNPS_results ? '<svg class="structure" width="220" height="140"></svg>' : ""}
        <div class="tip-foot">${f.node >= 0 ? "" : "Not located in the TMAP · "}Click to copy details</div>`;
      tooltip.hidden = false;
      const target = tooltip.querySelector(".structure");
      if (target && window.SmiDrawer) {
        try { new SmiDrawer({}, {}).draw(r.Smiles_GNPS_results, target, "light"); } catch (e) { /* unparsable SMILES */ }
      }
    }
    tooltip.hidden = false;
    const pad = 14, tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let left = event.clientX + pad, top = event.clientY + pad;
    if (left + tw > window.innerWidth - 8) left = event.clientX - tw - pad;
    if (top + th > window.innerHeight - 8) top = Math.max(8, window.innerHeight - th - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTooltip() { tooltip.hidden = true; lastTipFor = null; }

  function copyFeature(f) {
    const r = f.rec;
    const text = [
      `Query Spectrum Nr: ${r.query_spectrum_nr}`,
      `Spectrum ID: ${r.spectrum_ids_ms2query_results}`,
      `MassDiff: ${r.MassDiff_GNPS_results}`,
      `NPC Pathway: ${r.npc_pathway_results_ms2query_results}`,
      `Super Class: ${r.cf_superclass_ms2query_results}`,
      `Class: ${r.cf_class_ms2query_results}`,
      `SMILES: ${r.smiles_ms2query_results}`,
      `InChIKey: ${r.inchikey_ms2query_results}`,
    ].join("\n");
    navigator.clipboard.writeText(text)
      .then(() => flash(`Feature #${f.index} copied to clipboard`))
      .catch(() => flash("Could not access the clipboard"));
  }

  let toastTimer;
  function flash(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function getCss(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
