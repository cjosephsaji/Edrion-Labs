import { makeTopicLesson, type TopicCheck, type TopicOutline } from '../teaching/topic-content';
import { modelState, plateVisual } from '../teaching/visual-examples';
import type { ModelState } from '../teaching/visual-spec';
const state = (b: ModelState['boundary'], progress = 0.4) => modelState({ progress, rate: 3 }, b);
function check(
  task: string,
  options: string[],
  correctIndex: number,
  explanation: string,
  model: ModelState,
): TopicCheck {
  return {
    task,
    options,
    correctIndex,
    explanation,
    model,
    feedback: options.map((_, i) =>
      i === correctIndex
        ? explanation
        : 'Look at the arrow directions and the material regions. ' + explanation,
    ),
  };
}
const boundary = (task: string, b: ModelState['boundary'], progress = 0.4) =>
  check(
    task,
    ['Divergent', 'Convergent', 'Transform'],
    ['divergent', 'convergent', 'transform'].indexOf(b),
    b === 'divergent'
      ? 'The arrows point away from the shared boundary. Rising mantle can feed a ridge as plates separate.'
      : b === 'convergent'
        ? 'The arrows point toward the boundary and the oceanic slab descends beneath the continent. This configuration can produce earthquakes and a volcanic arc.'
        : 'The arrows run along the shared fault in opposite directions. Sliding can produce earthquakes without creating a spreading ridge.',
    state(b, progress),
  );
const outline: TopicOutline = {
  title: 'Tectonic plates',
  subject: 'Earth science',
  subtitle: 'A solid surface, moving slowly.',
  introduction:
    'Earth’s surface is divided into rigid plates. See what a plate contains, trace its slow motion, and use evidence to explain a new landscape.',
  learningGoals: [
    'Locate lithospheric plates above the ductile asthenosphere.',
    'Distinguish divergent, convergent and transform motion.',
    'Use motion and geological evidence to predict a boundary process.',
  ],
  prerequisites: ['Know that Earth has layers and that arrows represent direction.'],
  diagnostic: [
    check(
      'Before we begin: what does a tectonic plate contain?',
      ['Crust and rigid uppermost mantle', 'Only a thin crust', 'Only liquid magma'],
      0,
      'A tectonic plate contains crust and rigid uppermost mantle.',
      state('divergent'),
    ),
    check(
      'Two plates move toward their shared boundary. What does that motion describe?',
      ['Convergence', 'Divergence', 'No relative motion'],
      0,
      'Moving toward each other is convergence.',
      state('convergent'),
    ),
  ],
  steps: [
    {
      concept: 'A surface made of plates',
      visual: plateVisual('layers'),
      introduction:
        'A plate is a rigid slab of lithosphere: crust plus the uppermost mantle. The ductile asthenosphere below is mostly solid rock that deforms over long times.',
      demonstration:
        'Trace the thin crust and the thicker lithospheric mantle beneath it. Both belong to the same rigid plate; the bracket spans both layers.',
      simpler:
        'The plate is the solid outer slab, not just its thin crust. Hotter rock beneath can slowly deform without being an ocean of liquid magma.',
      example:
        'A plate can carry oceanic and continental crust while remaining one lithospheric slab.',
      diagramLabels: ['Crust', 'Lithospheric mantle', 'Ductile asthenosphere'],
      diagramCaption:
        'Material layers are schematic and not to scale. The asthenosphere is mostly solid.',
      check: check(
        'Which two layers make up the rigid slab shown?',
        ['Crust and lithospheric mantle', 'Crust and the entire core', 'Only the asthenosphere'],
        0,
        'Crust and rigid uppermost mantle together form lithosphere.',
        state('divergent'),
      ),
      followup: check(
        'A sample lies below the crust but inside the rigid slab. Is it part of the plate?',
        ['Yes, it is lithospheric mantle', 'No, all mantle is liquid', 'No, a plate is only crust'],
        0,
        'The uppermost rigid mantle is part of the plate.',
        state('divergent'),
      ),
      independent: check(
        'An oceanic slab includes basaltic crust and cold rigid mantle. Which name describes the whole slab?',
        ['Lithosphere', 'Asthenosphere', 'Liquid outer core'],
        0,
        'Crust and rigid mantle together are lithosphere.',
        state('divergent'),
      ),
      final: check(
        'A plate carries a continent and neighboring ocean floor. Which description is consistent?',
        [
          'One rigid slab can include both crust types',
          'A plate must be entirely continental',
          'Plates are rafts on liquid magma',
        ],
        0,
        'Many plates include both oceanic and continental lithosphere.',
        state('divergent'),
      ),
    },
    {
      concept: 'Slow motion, large changes',
      visual: plateVisual('movement'),
      introduction:
        'Plates move slowly relative to one another, typically a few centimeters per year. The demonstration accelerates that motion so it is visible.',
      demonstration:
        'Play the motion or move the progress slider. The two rigid slabs separate above the ductile asthenosphere; the rate label describes real-world units, not screen speed.',
      simpler:
        'A small movement each year can accumulate into a large distance over millions of years.',
      example:
        'At a constant relative rate of 3 cm/year, separation increases by 30 cm in ten years.',
      diagramLabels: ['Rigid plate A', 'Relative motion', 'Rigid plate B'],
      diagramCaption: 'Animation time is illustrative; use cm/year for geological rates.',
      check: check(
        'At 3 cm/year relative separation, how much distance is added in 10 years?',
        ['30 cm', '30 km', '0 cm'],
        0,
        '3 cm/year × 10 years = 30 cm.',
        state('divergent'),
      ),
      followup: check(
        'At 4 cm/year for 5 years, what separation is added?',
        ['20 cm', '20 km', '4 cm'],
        0,
        '4 × 5 = 20 cm.',
        modelState({ progress: 0.5, rate: 4 }),
      ),
      independent: check(
        'A pair separates at 5 cm/year for 12 years. How much separation accumulates?',
        ['60 cm', '60 km', '5 cm'],
        0,
        '5 × 12 = 60 cm.',
        modelState({ progress: 0.3, rate: 5 }),
      ),
      final: check(
        'A relative motion of 2 cm/year continues for 25 years. What distance results?',
        ['50 cm', '50 m', '2 cm'],
        0,
        '2 × 25 = 50 cm.',
        modelState({ progress: 0.6, rate: 2 }),
      ),
    },
    {
      concept: 'Three kinds of boundary',
      visual: plateVisual('boundaries'),
      introduction:
        'Relative motion distinguishes boundaries: apart, toward each other, or along a fault. Select each boundary and compare the arrows and material geometry.',
      demonstration:
        'Divergence opens a gap with rising mantle. This convergent example subducts an oceanic plate beneath a continent. Transform motion slides plates along a fault.',
      simpler: 'Read the arrows first: apart, together, or sideways past each other.',
      example:
        'A continental collision is also convergence, but it can build mountains without the same oceanic subduction configuration.',
      diagramLabels: ['Divergent', 'Convergent', 'Transform'],
      diagramCaption:
        'The subduction model is one convergent configuration; not every convergence produces the same features.',
      check: boundary(
        'Predict from the arrows: which boundary can open a ridge or rift?',
        'divergent',
      ),
      followup: boundary(
        'This new example has opposing arrows along a shared fault. Which boundary is it?',
        'transform',
      ),
      independent: boundary(
        'At a new margin a dense oceanic slab descends below a continent. Which motion explains this?',
        'convergent',
        0.65,
      ),
      final: boundary(
        'A different seafloor margin separates and hot mantle rises below it. Classify the boundary.',
        'divergent',
        0.8,
      ),
    },
    {
      concept: 'Investigate motion and consequences',
      visual: plateVisual('boundaries', 'transform'),
      introduction:
        'Choose a boundary, move the model, and make a prediction. Your practice question uses a fixed example so the prediction can be compared with its actual motion.',
      demonstration:
        'Trace the transform arrows along the fault. They indicate sliding, not an opening gap. Earthquakes can occur as a locked fault releases strain.',
      simpler: 'Sideways sliding does not create the same ridge as plates moving apart.',
      example:
        'In subduction, earthquakes can occur along the descending slab and a volcanic arc can form above it. These features differ from a transform fault.',
      diagramLabels: ['Relative motion', 'Shared fault', 'Earthquake locations'],
      diagramCaption:
        'Select and scrub the three configurations before predicting a fixed example.',
      check: boundary(
        'The arrows slide along the fault. Which boundary process predicts this motion?',
        'transform',
      ),
      followup: boundary(
        'Now the arrows point apart and material rises beneath a gap. Which process applies?',
        'divergent',
      ),
      independent: boundary(
        'A new fault offsets a road horizontally; neither side moves apart. Which boundary best explains it?',
        'transform',
        0.7,
      ),
      final: boundary(
        'An offshore trench lies beside a continent and an oceanic slab descends. Which boundary explains it?',
        'convergent',
        0.7,
      ),
    },
    {
      concept: 'Read a new landscape',
      visual: plateVisual('boundaries', 'convergent'),
      introduction:
        'Use more than one piece of evidence to identify a process. Boundary names alone do not predict every geological feature.',
      demonstration:
        'Follow the oceanic slab beneath the continent. Earthquakes along the slab and volcanoes above it are consistent with this subduction configuration.',
      simpler:
        'Connect the shape of the slab and the arrows to the features, then test a new case.',
      example:
        'When two continents collide, convergence can thicken crust and build mountains. Do not assume every convergent margin looks like this model.',
      diagramLabels: ['Descending slab', 'Earthquakes', 'Volcanic arc'],
      diagramCaption:
        'One oceanic–continental subduction example, not a universal convergent boundary.',
      check: boundary('Which boundary fits the descending oceanic slab shown?', 'convergent'),
      followup: boundary(
        'A different landscape shows sliding motion along a fault with no descending slab. Classify it.',
        'transform',
      ),
      independent: boundary(
        'At an unfamiliar ocean floor, plates separate and new crust forms along a ridge. What process explains it?',
        'divergent',
        0.6,
      ),
      final: check(
        'Two continents converge and build high mountains without this oceanic slab configuration. What follows?',
        [
          'Convergent features depend on plate configuration',
          'Every convergence must form the same volcanic arc',
          'Mountain building proves divergence',
        ],
        0,
        'Continental collision differs from oceanic–continental subduction; both are convergence.',
        state('convergent', 0.5),
      ),
    },
  ],
};
export const tectonics = {
  ...makeTopicLesson(outline, 'prepared', 'topic-tectonic-plates'),
  references: [
    {
      title: 'USGS: What is a tectonic plate?',
      url: 'https://pubs.usgs.gov/gip/dynamic/tectonic.html',
    },
    {
      title: 'USGS: Plate tectonics in a nutshell',
      url: 'https://volcanoes.usgs.gov/about/edu/dynamicplanet/nutshell.php',
    },
    {
      title: 'NPS: Types of plate boundaries',
      url: 'https://www.nps.gov/subjects/geology/plate-tectonics-types-of-plate-boundaries.htm',
    },
  ],
};
