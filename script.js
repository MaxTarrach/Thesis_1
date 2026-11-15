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
  const sampleName = (i) => `S${i + 1}`;

  const state = { colorBy: "superclass", sortBy: "index", hover: null, selected: null };

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
  const help = document.getElementById("help");

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

    document.getElementById("prov-samples").textContent = SAMPLES.length;
    document.getElementById("prov-ref").textContent = d3.format(",")(CS.x.length);
    document.getElementById("map-caption").textContent =
      `TMAP of ${d3.format(",")(CS.x.length)} reference compounds; ${onMap.length} matched analogues shown.`;

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
    // Click selects (ring on map, tick on matrix row) and copies; a second click or Esc clears.
    function setSelected(f) {
      state.selected = f ? f.index : null;
      map.select();
      matrix.select();
    }
    map.onClick = matrix.onClick = (f) => {
      if (state.selected === f.index) { setSelected(null); return; }
      setSelected(f);
      copyFeature(f);
    };

    function recolor() { map.recolor(); matrix.recolor(); }

    // Colour encoding: the switch and the keys themselves both select it.
    function setColorBy(enc) {
      state.colorBy = enc;
      d3.selectAll(".enc-switch [data-enc]").attr("aria-checked", function () { return this.dataset.enc === enc; });
      d3.selectAll(".key").classed("inactive", function () { return this.dataset.enc !== enc; });
      recolor();
    }
    d3.selectAll("[data-enc]").on("click", function () { setColorBy(this.dataset.enc); });

    // Matrix sort (only affects the matrix, so it lives in the matrix header)
    function setSort(sort) {
      state.sortBy = sort;
      d3.selectAll("[data-sort]").attr("aria-checked", function () { return this.dataset.sort === sort; });
      matrix.sort(true);
    }
    d3.selectAll("[data-sort]").on("click", function () { setSort(this.dataset.sort); });

    d3.selectAll("[data-zoom]").on("click", function () {
      const z = this.dataset.zoom;
      if (z === "reset") map.resetZoom(); else map.zoomBy(z === "in" ? 1.5 : 1 / 1.5);
    });

    // Keyboard: + / - zoom, R reset, S cycle sort, C toggle colour, Esc clear selection.
    document.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest && e.target.closest("input, textarea, select")) return;
      switch (e.key) {
        case "+": case "=": map.zoomBy(1.5); break;
        case "-": case "_": map.zoomBy(1 / 1.5); break;
        case "r": case "R": map.resetZoom(); break;
        case "s": case "S": setSort(state.sortBy === "index" ? "confidence" : "index"); break;
        case "c": case "C": setColorBy(state.colorBy === "superclass" ? "confidence" : "superclass"); break;
        case "Escape": setSelected(null); break;
        default: return;
      }
      e.preventDefault();
    });

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

    const R = 5;
    const readout = document.getElementById("zoom-readout");
    const zoom = d3.zoom()
      .scaleExtent([0.8, 40])
      .on("zoom", (event) => {
        transform = event.transform;
        mapG.attr("transform", transform);
        readout.textContent = `${transform.k.toFixed(1)}×`;
        sizeMarks();
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
    const byIndex = new Map(onMap.map((f) => [f.index, f]));
    const hoverRing = mapG.append("circle").attr("class", "hover-ring").style("display", "none");
    const selRing = mapG.append("circle").attr("class", "sel-ring").style("display", "none");

    // Marks keep a constant on-screen size while zooming.
    function sizeMarks() {
      const k = transform.k;
      dots.attr("r", R / k).attr("stroke-width", (f) => (isHollow(f) ? 1.2 : 1) / k);
      hoverRing.attr("r", (R + 2.5) / k).attr("stroke-width", 1 / k);
      selRing.attr("r", (R + 3.5) / k).attr("stroke-width", 2 / k);
    }
    function placeRing(ring, index) {
      const f = index === null ? null : byIndex.get(index);
      ring.style("display", f ? null : "none");
      if (f) ring.attr("cx", x(f.tx)).attr("cy", y(f.ty)).raise();
    }

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
      placeRing(hoverRing, state.hover);
      placeRing(selRing, state.selected);
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

    api.recolor = () => { dots.attr("fill", colorOf).classed("hollow", isHollow); sizeMarks(); };
    api.highlight = () => {
      const h = state.hover;
      dots.classed("dim", (f) => h !== null && f.index !== h && f.index !== state.selected);
      if (h !== null) dots.filter((f) => f.index === h).raise();
      placeRing(hoverRing, h);
      placeRing(selRing, state.selected);
    };
    api.select = () => placeRing(selRing, state.selected);
    api.resize = resize;
    api.resetZoom = () => overlay.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
    api.zoomBy = (factor) => overlay.transition().duration(250).call(zoom.scaleBy, factor);

    resize();
    api.recolor();
    return api;
  }

  // =====================================================================
  // Matrix view: rows = features, columns = samples, cell = presence.
  // =====================================================================
  function createMatrix(features) {
    const api = { onHover: () => {}, onClick: () => {} };
    const margin = { top: 24, right: 12, bottom: 0 };
    const RUG_LABEL = 12, RUG_W = 6, RUG_GAP = 6, COL_GAP = 2;
    const byIndex = new Map(features.map((f) => [f.index, f]));
    const cellsData = features.flatMap((f) => [...f.samples].map((s) => ({ f, s })));
    const sampleCounts = SAMPLES.map((s) => features.filter((f) => f.samples.has(s)).length);

    // Columns: fixed 2px gaps between samples.
    let x0 = 0, x1 = 0, colW = 0;
    const colX = (s) => x0 + s * (colW + COL_GAP);
    const yRow = d3.scaleBand().paddingInner(0.18);

    const root = matrixSvg.append("g");
    const header = root.append("g");
    const tracks = root.append("g");
    const rugLabel = root.append("text").attr("class", "col-sub").text("map");
    const flags = root.append("g");
    const cellsG = root.append("g");
    const highlightRect = root.append("rect").attr("class", "row-highlight").style("display", "none");
    const selTick = root.append("rect").attr("class", "sel-tick").style("display", "none");
    const hit = root.append("rect").attr("fill", "transparent").style("cursor", "pointer");

    const cells = cellsG.selectAll("rect").data(cellsData).join("rect").attr("class", "cell");
    const mapFlags = flags.selectAll("rect")
      .data(features.filter((f) => f.node >= 0)).join("rect")
      .attr("class", "map-flag");

    function order() {
      const sorted = features.slice();
      if (state.sortBy === "confidence") sorted.sort((a, b) => d3.descending(a.confidence, b.confidence) || a.index - b.index);
      return sorted.map((f) => f.index);
    }

    function layout(animate) {
      const rect = matrixSvg.node().getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const rugX = RUG_LABEL;
      x0 = rugX + RUG_W + RUG_GAP;
      x1 = w - margin.right;
      colW = Math.max(1, (x1 - x0 - COL_GAP * (SAMPLES.length - 1)) / SAMPLES.length);
      yRow.domain(order()).range([margin.top, h - margin.bottom]);
      const bodyH = Math.max(0, h - margin.top - margin.bottom);

      header.selectAll("text.col-head").data(SAMPLES).join((enter) => {
        const t = enter.append("text").attr("class", "col-head");
        t.append("tspan").attr("class", "col-label");
        t.append("tspan").attr("class", "col-sub").attr("dx", 6);
        return t;
      })
        .attr("x", colX).attr("y", 14)
        .call((t) => t.select(".col-label").text((s) => `S${s + 1}`))
        .call((t) => t.select(".col-sub").text((s) => `n=${sampleCounts[s]}`));

      rugLabel.attr("transform", `translate(${rugX - 11},${margin.top}) rotate(90)`);

      tracks.selectAll("rect").data(SAMPLES).join("rect")
        .attr("class", "track")
        .attr("x", colX).attr("y", margin.top)
        .attr("width", colW).attr("height", bodyH);

      const t = animate ? matrixSvg.transition().duration(600) : null;
      const target = (sel) => (t ? sel.transition(t) : sel);
      const tickH = Math.max(1, yRow.bandwidth());

      target(cells)
        .attr("x", (d) => colX(d.s)).attr("width", colW)
        .attr("y", (d) => yRow(d.f.index)).attr("height", yRow.bandwidth());

      target(mapFlags)
        .attr("x", rugX).attr("width", RUG_W)
        .attr("y", (f) => yRow(f.index) + (yRow.bandwidth() - tickH) / 2)
        .attr("height", tickH);

      hit.attr("x", 0).attr("y", margin.top)
        .attr("width", Math.max(0, x1)).attr("height", bodyH);

      api.highlight();
      api.select();
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
      const pad = 1;
      highlightRect.style("display", null)
        .attr("x", x0 - pad).attr("y", yRow(h) - pad)
        .attr("width", x1 - x0 + 2 * pad).attr("height", yRow.bandwidth() + 2 * pad);
    };
    api.select = () => {
      const s = state.selected;
      selTick.style("display", s === null ? "none" : null);
      if (s === null) return;
      const th = Math.max(2, yRow.bandwidth());
      selTick.attr("x", x1 + 3).attr("width", 6)
        .attr("y", yRow(s) + (yRow.bandwidth() - th) / 2).attr("height", th);
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
    const items = d3.select("#legend-superclass").append("div").attr("class", "swatches")
      .selectAll(".swatch")
      .data(SUPERCLASSES.filter((s) => counts.has(s.name)))
      .join("div").attr("class", "swatch").attr("title", (s) => s.name);
    items.append("i")
      .classed("hollow", (s) => s.name === UNCLASSIFIED)
      .style("background", (s) => SUPERCLASS_COLORS.get(s.name));
    items.append("span").attr("class", "label").text((s) => s.short);
    items.append("span").attr("class", "count").text((s) => counts.get(s.name));

    drawRamp(features);
  }

  // 160×6 ramp, ticks at 0 / 0.5 / 1, bracket under the observed min–max.
  function drawRamp(features) {
    const BAR_W = 160, BAR_H = 6, m = 6;
    const svg = d3.select("#legend-confidence").append("svg")
      .attr("class", "ramp").attr("width", BAR_W + 2 * m).attr("height", 44);
    const gid = "conf-gradient";
    const grad = svg.append("defs").append("linearGradient").attr("id", gid);
    d3.range(0, 1.0001, 0.1).forEach((t) => grad.append("stop").attr("offset", t).attr("stop-color", confidenceColor(t)));

    const sx = d3.scaleLinear().domain([0, 1]).range([m, m + BAR_W]);
    const [lo, hi] = d3.extent(features, (f) => f.confidence);

    svg.append("rect").attr("x", sx(0)).attr("y", 0).attr("width", BAR_W).attr("height", BAR_H)
      .attr("fill", `url(#${gid})`);
    svg.append("g").attr("transform", `translate(0,${BAR_H})`)
      .call(d3.axisBottom(sx).tickValues([0, 0.5, 1]).tickSize(3).tickPadding(2).tickFormat(d3.format("~g")))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.attr("font-family", null).attr("font-size", null));

    const by = 26;
    svg.append("path").attr("class", "bracket").attr("d", `M${sx(lo)},${by} V${by + 3} H${sx(hi)} V${by}`);
    svg.append("text").attr("x", (sx(lo) + sx(hi)) / 2).attr("y", by + 14).attr("text-anchor", "middle")
      .text("observed")
      .append("title").text(`observed ${d3.format(".2f")(lo)}–${d3.format(".2f")(hi)}`);
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
          <dt>feature</dt><dd>#${f.index}, query spectrum ${fmt(r.query_spectrum_nr)}</dd>
          <dt>present in</dt><dd>${present}</dd>
          <dt>analogue</dt><dd>${escapeHtml(fmt(r.analog_compound_name_ms2query_results))}</dd>
          <dt>confidence</dt><dd>${d3.format(".3f")(f.confidence)}</dd>
          <dt>superclass</dt><dd>${escapeHtml(f.superclass)}</dd>
          <dt>class</dt><dd>${escapeHtml(fmt(r.cf_class_ms2query_results))}</dd>
          <dt>NPC pathway</dt><dd>${escapeHtml(fmt(r.npc_pathway_results_ms2query_results))}</dd>
          <dt>spectrum ID</dt><dd>${escapeHtml(fmt(r.spectrum_ids_ms2query_results))}</dd>
          <dt>mass diff.</dt><dd>${fmt(r.MassDiff_GNPS_results)}</dd>
        </dl>
        ${r.Smiles_GNPS_results ? '<svg class="structure" width="220" height="140"></svg>' : ""}
        <div class="tip-foot">${f.node >= 0 ? "" : "not in TMAP; "}click: select + copy</div>`;
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
      .then(() => flash(`copied #${f.index}`))
      .catch(() => flash("clipboard unavailable"));
  }

  // Brief status in the help line instead of a toast.
  const HELP_TEXT = help.textContent;
  let helpTimer;
  function flash(msg) {
    help.textContent = msg;
    help.classList.add("flash");
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => { help.textContent = HELP_TEXT; help.classList.remove("flash"); }, 1800);
  }

  function getCss(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
