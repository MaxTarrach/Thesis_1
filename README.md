# Interactive Visualization of MS2Query Analogue Search Results

**Design and comparative analysis of interactive data visualization concepts for exploring complex biochemical samples**

Master's thesis project · M.Sc. Media Informatics · Hochschule Düsseldorf (Faculty of Media)
Author: Maximilian Tarrach · Supervisors: Prof. Kay M. Schröder, Prof. Dr. Florian Huber · Submitted May 2024

---

## About the project

Metabolomics studies the small molecules in a biological system. It has applications in precision medicine, agricultural science and clinical diagnostics. Identifying those molecules is still a slow, largely manual bottleneck.

[MS2Query](https://github.com/iomega/ms2query) speeds this up by using machine learning to find the closest known compound, the *analogue*, for each unknown spectrum. Its output is a dense table with 25 attributes per compound, which is hard to explore by hand.

This project is a browser-based prototype that turns MS2Query results from **several samples** into an interactive **multi-view visualization**. It helps researchers spot the compounds worth investigating further.

## Key numbers

| | |
|---|---|
| **20,889** | reference compounds from the GNPS library mapped in the TMAP |
| **190** | compounds from **3 samples** in the demo dataset |
| **25** | MS2Query attributes per compound, abstracted and classified |
| **2** | linked views (TMAP + matrix) |
| **< 1 → 60 fps** | rendering performance after rasterizing the library layer |
| **35** | expert findings from the user evaluation, in 7 categories |

## Features

### TMAP view: compounds in chemical space
- The GNPS reference library is drawn as a TMAP, a tree-based layout in which chemically similar compounds sit close together.
- Analogues found by MS2Query are placed on top of the library, so you can see *where* in chemical space your sample's hits fall.
- Compounds that appear in several samples are merged into a single point.

### Matrix view: comparing samples
- Each column is a sample, and each circle is a compound.
- **Circle size** shows the MS2Query confidence and **color** shows the chemical superclass.
- You can sort by original index or by confidence.

### Linked views
- Hovering over a compound in either view highlights every occurrence of it in the other view.

### Color schemes
- **Categorical:** 10 colors for the ClassyFire superclasses, plus white for unknown or missing classes.
- **Confidence:** a continuous yellow → red → black scale for MS2Query prediction scores from 0 to 1.

### Tooltips and export
- The tooltip shows the query spectrum number, MS2Query spectrum ID, mass difference, NPC pathway, superclass and class.
- The chemical structure is drawn from SMILES with smilesDrawer.
- Clicking a compound copies its attributes to the clipboard, so you can look it up in other tools.

## Data pipeline

```
Tandem mass spectra (MS/MS)
        │
        ▼
    MS2Query  ──► analogue search (Spec2Vec, MS2DeepScore, precursor m/z, Tanimoto → random forest)
        │
        ▼
Enrichment   ──► + compound index, file name, file index (enables multi-sample input)
        │
        ▼
   metab.json
        │
        ▼
D3.js visualization (TMAP + matrix)
```

Example of a single compound record (shortened):

```json
{
  "index": 3,
  "query_spectrum_nr": 170,
  "precursor_mz_query_spectrum": 114.064,
  "Smiles_GNPS_results": "CC1=CNC(=O)NC1=O",
  "superclass_GNPS_results": "Organoheterocyclic compounds",
  "ms2query_model_prediction_ms2query_results": 0.409,
  "analog_compound_name_ms2query_results": "bis[2-(2-butoxyethoxy)ethyl] hexanedioate",
  "cf_superclass_ms2query_results": "Lipids and lipid-like molecules",
  "cf_class_ms2query_results": "Fatty Acyls",
  "npc_pathway_results_ms2query_results": "Fatty acids",
  "file_name": "clustered_spectra_sample",
  "file_index": 0
}
```

The full demo dataset is available in [`metab.json`](https://raw.githubusercontent.com/MaxTarrach/Thesis_1/main/metab.json).

## Tech stack

- [D3.js](https://d3js.org/) for the visualizations, interaction and linked views
- [chroma.js](https://gka.github.io/chroma.js/) for color scales and interpolation
- [smilesDrawer](https://github.com/reymond-group/smilesDrawer) to render chemical structures from SMILES strings
- [TMAP](https://tmap.gdb.tools/) for the library layout
- [Vercel](https://vercel.com/) for hosting during the expert evaluation

## Methodology

The project follows Tamara Munzner's **Nested Design Model**:

1. **Domain characterization.** Semi-structured interviews with experts in plant chemistry, clinical research and computational metabolomics.
2. **Data and task abstraction.** All 25 MS2Query attributes were classified as categorical, ordered or quantitative. The core task was defined with Brehmer & Munzner's typology as *discover → explore → identify*.
3. **Visual encoding and interaction.** The TMAP handles selecting, navigating and aggregating. The matrix handles selecting, navigating and sorting.
4. **Evaluation.** Informal think-aloud user tests with domain experts, analyzed with deductive and inductive qualitative coding (following Lam et al. and Mayring).

## Evaluation results

**What worked**
- Presence/absence across samples in the matrix gave insights similar to molecular networking.
- Mapping hits onto the library showed how well the reference library covers the sample.
- Color-coded classes and the confidence scale made it quick to prioritize compounds.

**What experts asked for**
- An interactive reference library, so you can zoom in and see each analogue's chemical neighborhood
- A mirror plot comparing the experimental MS/MS spectrum with the analogue's spectrum
- Finer chemical classes, with filtering or highlighting of selected classes
- Relative intensities per sample instead of presence/absence only
- A more compact matrix, a dynamic legend and stronger highlighting between the linked views
- A simple wrapper that goes straight from MS2Query output to the visualization

## Limitations and future work

- The user tests used a demo dataset. Evaluation with the experts' own data would give more meaningful results.
- Only the top analogue per compound is shown. Showing the top-k matches could reveal whether hits agree with each other.
- The library layer is a static image for performance reasons. Making it interactive (for example with a canvas or WebGL renderer) is the main next step.
- Future studies should reach more users, for example at conference workshops, including researchers without a programming background (41% of participants in one community survey).

## Acknowledgements

Many thanks to Prof. Kay M. Schröder and Prof. Dr. Florian Huber for their supervision, and to all the domain experts who gave their time for interviews and user tests.

This project builds on [MS2Query](https://doi.org/10.1038/s41467-023-37446-4) (de Jonge et al., 2023), [GNPS](https://gnps.ucsd.edu/) (Wang et al., 2016) and [TMAP](https://doi.org/10.1186/s13321-020-0416-x) (Probst & Reymond, 2020).
