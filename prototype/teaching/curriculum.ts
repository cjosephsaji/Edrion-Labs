import { alphaBeta, minimax } from './algorithms';
import { activeTree } from './tree-variant';
import type { Lesson, Question, ShowcaseState } from './types';

export interface MiniExample {
  role: 'MAX' | 'MIN';
  values: number[];
  revealAnswer: boolean;
  label: string;
}
export interface TeachingPlan {
  introduction: string;
  demonstration: string;
  simpler: string;
  example: string;
  followup: Question;
  target: string | null;
  demoExample?: MiniExample;
  checkExample?: MiniExample;
  retryExample?: MiniExample;
  followupExample?: MiniExample;
}
const rows: Record<string, string[][]> = {
  ai3: [
    [
      'A game has two decision makers. A move that looks good now can be spoiled by the opponent’s next choice.',
      'Think of offering your opponent two doors. They choose the door that helps them, so you cannot promise yourself the better prize.',
      'Look at MAX above MIN A: the first player chooses a branch; the opponent chooses the outcome below it.',
    ],
    [
      'Scores measure how good an outcome is for MAX. When MAX controls a choice, it wants the larger score.',
      'MAX wants more points. Compare two numbers and keep the larger one.',
      'In a worked MAX example, 2 and 6 are available. MAX keeps 6. Your check uses different values.',
    ],
    [
      'MIN is the opponent. It chooses the smaller score because the scores measure MAX’s benefit.',
      'MIN wants MAX to get fewer points. A large score may exist, but the opponent can choose the smaller one.',
      'In a worked MIN example, the scores are 1 and 4. MIN returns 1. Now try MIN A with 3 and 5.',
    ],
    [
      'A game tree shows choices in layers. Select an internal MIN node to inspect its children; that node returns one guarantee to its parent.',
      'Work on just one pair of leaves. The opponent chooses from that pair before MAX can compare branches.',
      'Inspect MIN B and its two children, 2 and 9. Which is the least favorable score for MAX?',
    ],
    [
      'The same MIN rule applies to every opponent branch. The order of the leaves does not change their minimum.',
      'Read both children. Keep the smaller score, even if it is drawn on the right.',
      'Inspect MIN C. Compare its actual two children before returning a value upward.',
    ],
    [
      'Back values up from leaves toward the root. Once each opponent has chosen, MAX compares the three guarantees.',
      'Replace each pair with its smaller score. Then choose the largest of those three results.',
      'The internal values are A=3, B=2 and C=1. Predict the value MAX returns.',
    ],
    [
      'Choose a whole branch by its guaranteed result. An attractive leaf inside a branch is not a promise.',
      'Ask what the opponent can force, then choose the best of those guarantees.',
      'B contains a 9, but MIN can choose 2. Compare that with A’s guaranteed 3.',
    ],
    [
      'Alpha-beta pruning saves work when a bound proves that more inspection cannot change the decision.',
      'Stop looking only when you already know a branch cannot beat an available choice.',
      'MAX already has a guarantee of 3. A MIN branch with a known child of 2 can never offer more than 2.',
    ],
    [
      'Alpha is MAX’s best guarantee so far. Beta bounds what a MIN branch can return. Prune when beta is no greater than alpha.',
      'B already offers the opponent a 2. Another B leaf cannot remove that option, so B cannot beat MAX’s 3.',
      'Trace A’s two visits, then B’s first visit. Compare beta=2 with alpha=3 before deciding about B’s remaining leaf.',
    ],
    [
      'Use the actual order of visits. A high first child at MIN is only an upper bound until its other children are checked.',
      'Compare the current beta with alpha. If beta is still greater, the cutoff has not been proved.',
      'Inspect the first visited child of C and the bounds shown on the board. Decide whether the next leaf is required.',
    ],
    [
      'Count evaluated leaves separately from skipped leaves. A skipped value is drawn for teaching, but the algorithm did not inspect it.',
      'Follow the visit marks one by one. Do not count a dashed skipped edge as an evaluation.',
      'The board shows the completed deterministic traversal. Count the visited leaves and compare with six leaves in the full tree.',
    ],
    [
      'Apply the rule with less assistance on a different small tree. Explain a guarantee rather than choosing the biggest leaf.',
      'First take the smaller value in each pair. Then choose the largest resulting guarantee.',
      'New tree: A has 4 and 7, B has 3 and 8, C has 2 and 6. Inspect the branches and explain MAX’s choice.',
    ],
  ],
  ai4: [
    [
      'An agent needs a way to represent what it knows. A knowledge base stores facts and rules so that conclusions have visible support.',
      'A fact says what is known. A rule says what can follow when a fact matches.',
      'Our board separates Facts, Rules and What follows. A statement about Tweety is different from a general rule.',
    ],
    [
      'TELL stores a represented statement. It adds knowledge; it does not answer every possible question.',
      'Think of TELL as putting a card in the Facts box.',
      'Press TELL Bird(Tweety). Watch that exact fact enter the Facts column.',
    ],
    [
      'A rule links a premise to a conclusion. The arrow means that a matching premise supports the result on its right.',
      '“If a bird, then has wings” is a bridge between statements, rather than a statement about one named bird.',
      'The board’s Bird(x) → HasWings(x) bridge belongs in Rules.',
    ],
    [
      'A variable is a placeholder for an entity. Use the same substitution throughout a rule.',
      'Replace every x with the same name. Do not replace it with a property such as HasWings.',
      'For a different bird named Rio, matching Bird(Rio) would replace x with Rio on both sides. Now match Tweety.',
    ],
    [
      'Inference combines a known fact with a matching rule. Apply only a rule whose premise is supported.',
      'Start at the fact, cross the matching rule, and keep the same name in the conclusion.',
      'Bird(Tweety) matches the wings rule. Apply the rule and watch the supported conclusion appear.',
    ],
    [
      'ASK checks what the stored knowledge supports. A yes answer needs a path from facts through permitted rules.',
      'Trace the arrows rather than guessing from what you know about real birds.',
      'The wings query can use the stored bird fact and the displayed wings rule.',
    ],
    [
      'A missing proof is different from a disproof. This knowledge base has a wings rule and no flight rule.',
      'An empty flight path means “not established here.” It does not mean the bird cannot fly.',
      'ASK CanFly(Tweety). The missing flight link remains visibly unsupported.',
    ],
    [
      'Forward chaining starts with facts and applies matching rules to produce new facts.',
      'Walk forward from what you already know.',
      'Start at Bird(Tweety), follow the wings rule, and arrive at HasWings(Tweety).',
    ],
    [
      'Backward chaining starts with a question and looks for the premises needed to support it.',
      'Work backward from “has wings?” to “is this entity a known bird?”',
      'Start at the wings query, find the wings rule, then check the bird fact.',
    ],
    [
      'A general rule can apply to another entity when its premise is present. Keep each entity’s facts separate.',
      'Rio needs a Rio fact. Tweety’s name cannot simply become Rio without a new premise.',
      'Add Bird(Rio), then apply the same wings rule with x := Rio.',
    ],
    [
      'An inference arrow must correspond to a stored rule. A plausible real-world statement can still be unsupported by this toy KB.',
      'Check whether the bridge is actually on the board.',
      'Compare a wings arrow with a flight arrow. Only the wings rule is stored.',
    ],
    [
      'Explain the two operations using the visible knowledge base. Your own words are saved without automated correctness claims.',
      'Describe what changes after TELL, then what ASK checks.',
      'Second example: TELL Bird(Rio) adds a fact; ASK HasWings(Rio) seeks a supported consequence.',
    ],
  ],
  ehs3: [
    [
      'Identify what could harm someone before choosing a control. At the highlighted platform edge, there is no barrier to a fall.',
      'Look at the open edge and imagine losing your balance. Name that specific risk.',
      'Compare the exposed edge with the guardrail in the safer illustration. This is educational hazard recognition.',
    ],
    [
      'Locate a hazard on the actual model. The missing protection is at the upper exposed edge, not at the wheels.',
      'Find the place where the barrier should be.',
      'Inspect the platform edge; the safer comparison adds the missing rail there.',
    ],
    [
      'An object at height can harm someone below if it falls. Loose tools need to be connected to that falling-object pathway.',
      'The risk travels downward from the tool to the people below.',
      'Compare a loose tool by the edge with the secured tool box in the safer illustration.',
    ],
    [
      'Nearby live electrical equipment creates a different hazard from an open edge. Point to the power-line feature.',
      'Look for the line above and beside the platform.',
      'The illustrated power line is separate from the scaffold. This model supplies no site clearance distance.',
    ],
    [
      'A platform needs stable support. A weak or unstable base can affect the entire structure.',
      'A stable top cannot compensate for a base that can move or fail.',
      'Inspect the highlighted support and compare its condition with the level, secured illustration.',
    ],
    [
      'Using equipment outside its intended arrangement can introduce instability. The illustrated ladder placed on the tower raises this concern.',
      'Extra height can also create extra instability.',
      'Compare the ladder resting on the tower with the separate access shown in the safer illustration.',
    ],
    [
      'A safer base addresses movement and instability directly. Compare the ground and the support rather than the paint color.',
      'Look for level support and secured wheels in this teaching model.',
      'The safer illustration changes the wheels and base; connect those changes to stability.',
    ],
    [
      'Movement changes the conditions that support a tower. These module notes warn against moving it while occupied or loaded.',
      'People and materials should not be carried along on a moving tower in this example.',
      'Imagine the wheel starting to roll while someone is above. The module’s control addresses that movement hazard.',
    ],
    [
      'Match the control to the cause of harm. A barrier addresses an open edge; a cosmetic change does not.',
      'Ask which changed object blocks the fall pathway.',
      'Toggle the safer setup and identify the new rail geometry.',
    ],
    [
      'The stage of work changes the hazard. Assembly risks occur while building the tower; use risks occur while working on it.',
      'Sort by when the activity happens.',
      'Second example: dismantling is a setup-stage risk; slipping on a platform is a use-stage risk.',
    ],
    [
      'Transfer the recognition process to a different scene. Unsupported earth can move into an excavation.',
      'Look at the sidewall rather than searching for scaffold parts.',
      'The small excavation scene highlights the unsupported sidewall. It illustrates collapse risk, not a work procedure.',
    ],
    [
      'Explain a risk-control link for two visible features. Naming a control without its risk leaves the reasoning incomplete.',
      'Say “this feature could cause this harm; this change addresses it.”',
      'One example is the loose tool and secured storage. Choose another visible feature for your explanation.',
    ],
  ],
  ehs5: [
    [
      'Inspection connects observation to correction. It helps identify hazards and suitable action without promising that all risk disappears.',
      'Look for a problem, then identify a change that addresses it.',
      'Trace the town outfall to the river: noticing the discharge should lead to considering treatment before discharge.',
    ],
    [
      'A direct discharge carries waste into water through a visible outfall. Trace the pipe from the town to the river.',
      'Follow the pipe; name what is entering the water.',
      'The highlighted outfall is a different pathway from rain washing chemicals off a field.',
    ],
    [
      'An intervention should act on the source or pathway before the pollutant reaches the river.',
      'Move the control upstream of the harm.',
      'Add treatment at the outfall in the conceptual model and observe that pathway change. Other pathways remain.',
    ],
    [
      'Rain or irrigation can carry farm chemicals off the field. This dispersed pathway differs from a town pipe.',
      'Follow the water moving over the field toward the river.',
      'The highlighted runoff arrows connect farmland to water. Treatment at the town outfall does not remove them.',
    ],
    [
      'Prevention can reduce the amount available to wash into water. Excess chemical application increases the runoff source.',
      'Less excess on the field means less excess available to be carried away.',
      'Compare the runoff arrows before and after the farm control in this qualitative illustration.',
    ],
    [
      'Solid waste can enter water as a separate pathway. Collection and suitable disposal act before that waste reaches the river.',
      'Water does not make rubbish harmless.',
      'Compare waste on the riverbank with the collected waste shown after its control.',
    ],
    [
      'A drain is a route into a wider water system. Pouring grease into it transfers the problem downstream.',
      'The drain is not a disposal bin for oil.',
      'The highlighted oil pathway stops when oil and grease are kept out of the drain.',
    ],
    [
      'Treatment has a purpose and limits. A treatment illustration cannot establish that water is suitable for every use.',
      'Cleaner-looking water is not a test result.',
      'A control can reduce one discharge while other contamination remains. Drinking suitability needs evidence beyond this model.',
    ],
    [
      'Individual choices can reduce waste and unnecessary water use. Link the action to the resource or pollution pathway.',
      'Prevent waste before it enters the system.',
      'Second example: repairing a dripping tap conserves water; suitable disposal keeps harmful products out of drains.',
    ],
    [
      'A useful inspection leads from a specific observation to a matching corrective action.',
      'Do more than count or record a hazard.',
      'Observe the outfall, identify untreated discharge, then propose a control for that same pathway.',
    ],
    [
      'Several sources can affect the same river. Match each source to its own control rather than assuming one fix covers all.',
      'Trace each of the four routes separately.',
      'Apply the town treatment. The farm, waste and oil routes still need their own controls.',
    ],
    [
      'Explain a plan as source, pathway and prevention. State what the illustration cannot establish.',
      'Name what enters the river, how it gets there, and what you would change in this model.',
      'Second example: excess fertilizer → runoff → reduced excess application. Choose another source to explain.',
    ],
  ],
  'open-ai': [
    [
      'Many AI systems use patterns to make predictions. A useful task has a defined input and an output that can be checked.',
      'A prediction is an informed estimate, not knowledge of the future.',
      'Our tiny model predicts a number from an input. Real AI systems can be much more complex.',
    ],
    [
      'Training examples connect inputs with useful targets. Relevant examples help identify a pattern.',
      'An example is a pair: what went in and what result was wanted.',
      'Second example: inputs 1 and 2 with targets 2 and 4 suggest a relationship worth checking on a new input.',
    ],
    [
      'An input enters a model; an output is the model’s prediction. Keep those roles separate.',
      'Follow the arrow from the incoming number through the weight.',
      'The visible model multiplies the input by a weight to produce its output.',
    ],
    [
      'This toy model uses one exact rule: prediction equals input times weight. Calculate before revealing the result.',
      'Multiplying by a half means taking half the input.',
      'Worked example: input 4 and weight 0.5 produce 2. Now try input 2 with the same weight.',
    ],
    [
      'Error compares a prediction with a target. Here we use the absolute distance between the two numbers.',
      'Count how far apart the numbers are, without a minus sign.',
      'Worked example: target 5 and prediction 2 have absolute error 3. Now compare the displayed target and prediction.',
    ],
    [
      'Changing the weight changes the actual multiplication. Keep the input fixed so you can see which change caused the new output.',
      'The weight is a volume knob for this one connection.',
      'Move the weight from 0.5 to 1.5 while input stays 2. Observe the output change.',
    ],
    [
      'Use the updated model values to make another prediction. A good result on one example is only limited evidence.',
      'Multiply the current input by the current weight again.',
      'The connection now has input 2 and weight 1.5. Predict its output before checking.',
    ],
    [
      'A toy example has limits. Fitting one target does not establish that predictions work well on unfamiliar inputs.',
      'Try another input before trusting the pattern everywhere.',
      'Second example: a pattern learned from a narrow set of images can fail on a different kind of image. Explain the limitation.',
    ],
  ],
  time: [
    [
      'Time travel can refer to different claims. Relativity compares elapsed times; that does not establish travel into the past.',
      'Separate clocks disagreeing from a clock running backward.',
      'The board compares Earth-frame time with a traveler’s elapsed time. Neither reading reverses.',
    ],
    [
      'A clock measures elapsed time along an observer’s path. Two observers can accumulate different amounts.',
      'Both clocks move forward, but their totals can differ.',
      'At 0.6c, ten Earth-frame years correspond to eight traveler years in the simplified constant-speed model.',
    ],
    [
      'The speed is expressed as a fraction of light speed. Use the stated formula for the specified interval.',
      'Read the speed and Earth interval before calculating.',
      'For ten Earth-frame years at 0.6c, multiply 10 by √(1−0.6²). Then compare with the question.',
    ],
    [
      'Increasing the speed changes the elapsed-time comparison. This model omits acceleration, turnaround and gravity.',
      'Change one speed setting and watch the traveler’s total.',
      'Compare 0.6c with 0.8c while Earth-frame time stays at ten years.',
    ],
    [
      'The traveler’s elapsed time comes from the model’s formula, not from reversing time.',
      'At 0.8c the square-root factor is 0.6.',
      'Worked example: five Earth-frame years at 0.8c correspond to three traveler years. Now use the displayed ten-year interval.',
    ],
    [
      'A conceptual model makes assumptions. Understand its limits before applying it to a complete journey.',
      'Look for effects the formula leaves out.',
      'This comparison treats a constant-speed segment and does not model the turnaround or gravity.',
    ],
    [
      'Evidence for time dilation does not establish that a person can visit the past. Different claims need different evidence.',
      'A shorter forward interval is still forward time.',
      'Neither computed clock has a negative interval or rewinds.',
    ],
    [
      'Explain what the clock model supports and what remains speculative. Your response is saved without automated grading.',
      'Describe what both clocks do, then name one limitation.',
      'Second example: changing the speed changes elapsed time, but neither clock travels into yesterday.',
    ],
  ],
};
function follow(
  q: Question,
  task: string,
  options: string[],
  correct: string[],
  explanation: string,
): Question {
  return {
    ...q,
    id: q.id + '-followup',
    task,
    options,
    correct,
    explanation,
    type: 'choice',
  };
}
const secondExamples: Record<string, string[]> = {
  ai3: [
    'Inspect MIN B: MAX might hope for the leaf 9, but the opponent can choose 2. That shows why a possible prize is not a promise.',
    'MAX chooses 6 from 2 and 6. The check will use a different pair.',
    'MIN chooses 2 from 2 and 6: the opponent controls this choice, and smaller scores hurt MAX.',
    'A second MIN node compares 4 and 8 and returns 4. Both possibilities exist, but only the smaller result is guaranteed.',
    'Put 7 on the left and 2 on the right. MIN still returns 2, so placement does not determine the minimum.',
    'For a new root with guarantees 4,3,2, MAX returns 4. These are guarantees after the opponent has chosen.',
    'A new tree has pairs 4/7, 3/8 and 2/6. Their guarantees are 4,3,2, so A is best despite B’s tempting 8.',
    'On the visible tree, MIN B can choose 2. Since MAX already has A’s 3, knowing B’s other child cannot make B the better guarantee.',
    'The skipped B leaf is 9. Even a larger value there cannot remove MIN B’s known option 2. The bound is enough to reject B.',
    'Compare MIN A’s known guarantee with C’s current upper bound. A cutoff needs beta no greater than alpha, not just a visited leaf.',
    'Compare the full six-leaf view with the visit marks. A skipped edge remains drawn for explanation, but contributes no evaluation.',
    'In the new tree, B has an attractive 8. Its opponent can still choose 3; A’s 4 is the better guarantee.',
  ],
  ai4: [
    'Second entity: Bird(Rio) is a fact. Bird(x) → HasWings(x) is still the general rule; they fill different columns.',
    'TELL Bird(Rio) adds a second named fact. It does not itself add CanFly(Rio).',
    'With Rio on the Facts side, the same wings bridge remains in Rules. The entity changes; the role of the rule does not.',
    'Match Bird(Rio) by replacing x with Rio on both sides: Bird(Rio) → HasWings(Rio).',
    'For the second entity, Bird(Rio) plus the wings rule yields HasWings(Rio). No flight result appears.',
    'ASK HasWings(Rio) has support from Bird(Rio) and the wings rule. Trace both pieces before answering.',
    'For Rio too, a wings rule gives no flight conclusion. CanFly(Rio) remains not established rather than false.',
    'Start at the second fact Bird(Rio), then follow the wings rule to HasWings(Rio). That is another forward path.',
    'Start at HasWings(Rio) as a goal. Find the wings rule, then look for its needed Bird(Rio) premise.',
    'Tweety and Rio remain different entities. Each can use the wings rule only with its own matching bird fact.',
    'Compare Rio’s supported wings arrow with the missing flight link. Only the wings arrow has a stored rule.',
    'For Rio, TELL adds the bird fact and ASK checks the wings query. One changes the knowledge; the other seeks support.',
  ],
  ehs3: [
    'Compare the safer version: adding the rail changes the open-edge feature. It addresses falling from height, rather than noise or water quality.',
    'In the safer comparison, the new rail spans the previously open platform edge. The power line and wheels are different features.',
    'The safer version puts tools in secured storage. Contrast that with the loose tool at the edge and the fall path to people below.',
    'The power line is separated in the safer illustration. Repainting the scaffold would not address that electrical feature.',
    'Compare the secured wheels and level support with the earlier uneven base. Those changes address structural stability.',
    'The safer illustration removes the ladder from the tower and shows separate access. This changes the arrangement rather than its color.',
    'In the comparison, secured wheels and firmer support address the base. A tidy platform alone would leave a moving base unresolved.',
    'Inspect a secured wheel in the safer version. The notes still warn against moving the tower while people or materials remain above.',
    'The visible added guardrail targets the edge. Securing a tool targets another risk and does not substitute for that barrier.',
    'Compare taking the tower apart with working on its platform. The first belongs to dismantling; slipping during work belongs to use.',
    'In the second scene, focus on the unsupported earth wall. A secured tool box would not prevent that wall from collapsing.',
    'The safer version secures tools and adds a rail. Explain separately how each change addresses a different pathway of harm.',
  ],
  ehs5: [
    'Inspect the farm runoff as a second source. The useful next step is a control for that source, rather than an unsupported declaration that all water is safe.',
    'The town treatment changes the pipe pathway. Compare it with the still-visible field runoff, which enters by another route.',
    'With town treatment shown, the untreated outfall pathway changes before the river. Farm runoff remains a separate issue.',
    'Apply the farm control: reducing excess chemicals removes the conceptual runoff arrows. Treating the pipe alone leaves that route open.',
    'Compare the farm arrows before and after reducing excess application. This is a source reduction illustration, not a measured water-quality result.',
    'In the controlled waste version, rubbish is collected instead of sitting near the water. That changes the route available for contamination.',
    'Compare oil reaching a drain with oil kept out of it. Town treatment is a different intervention on a different source.',
    'A treated outfall and an uncontrolled farm can coexist. That visible combination explains why one treatment cannot establish drinking safety.',
    'Waste collection prevents debris entering water, while conserving water reduces unnecessary use. These individual actions address different concerns.',
    'Inspect the drain as a second example: observing oil there should lead to keeping oil out of that drain.',
    'The town pathway is controlled while the field, waste and drain routes remain. Trace each before selecting the remaining controls.',
    'One plan is sewage → outfall → treatment before discharge. Another is farm chemicals → runoff → reduced excessive use.',
  ],
  'open-ai': [
    'In a second input-target pair, the model can be checked by comparing its number with the desired result. That is a bounded prediction task.',
    'Pairs (1,2) and (2,4) suggest doubling. Checking (3,6) provides another example rather than assuming the pattern fits everything.',
    'In a second connection, input 4 enters and weight 0.5 produces 2. The incoming 4 is different from the outgoing 2.',
    'Input 4 with weight 0.5 predicts 2. The follow-up will use this multiplication rule.',
    'With prediction 2 and target 5, the distance is 3. Compare that with the earlier prediction 1 and target 3.',
    'Keeping input 2 fixed, weight 1.5 produces 3 instead of the 1 produced by weight 0.5. One variable caused the change.',
    'Another input, 3, with weight 1.5 predicts 4.5. The multiplication rule stays the same.',
    'A model that fits only one target still needs new examples. A different input can expose whether its pattern generalizes.',
  ],
  time: [
    'The second clock reading is shorter but still positive. That observable comparison differs from a fictional journey to the past.',
    'Compare five Earth-frame years at 0.8c with three traveler years. Each clock belongs to an observer under the stated assumptions.',
    'At 0.6c, ten and eight are both forward elapsed-time readings. A shorter interval is not a negative interval.',
    'At five Earth-frame years, 0.8c gives three traveler years; the higher speed still changes the factor rather than reversing time.',
    'For five Earth-frame years at 0.8c, 5 × 0.6 gives three traveler years. Use the same formula on another interval.',
    'A constant-speed segment with five Earth-frame years still leaves acceleration and turnaround out. Changing the interval does not add those effects.',
    'The traveler’s three years in the second example remain positive. Neither clock goes into yesterday.',
    'The second numerical comparison supports different elapsed times under the assumptions. It does not establish backward travel or a portal.',
  ],
};
export function teachingPlan(
  state: ShowcaseState,
  lesson: Lesson,
  q: Question,
): TeachingPlan {
  const i = lesson.questions.findIndex((item) => item.id === q.id);
  const row = rows[lesson.id]![Math.max(0, i)]!;
  let followup: Question;
  let target: string | null = null;
  let demoExample: MiniExample | undefined,
    checkExample: MiniExample | undefined,
    retryExample: MiniExample | undefined,
    followupExample: MiniExample | undefined;
  if (lesson.id === 'ai3') {
    const tree = activeTree({
      ...state.visualState,
      kind: 'tree',
      transfer: false,
    } as typeof state.visualState);
    const mm = minimax(tree),
      pass = alphaBeta(tree);
    target =
      i === 2
        ? 'branch-0'
        : i === 3
          ? 'branch-1'
          : i === 4
            ? 'branch-2'
            : i === 8
              ? 'leaf-1-0'
              : i === 9
                ? 'branch-2'
                : 'root';
    if (i === 1 || i === 2) {
      const role = i === 1 ? 'MAX' : 'MIN';
      demoExample = {
        role,
        values: i === 1 ? [2, 6] : [1, 4],
        revealAnswer: true,
        label: 'Worked example',
      };
      checkExample = {
        role,
        values: i === 1 ? [4, 7] : [3, 5],
        revealAnswer: false,
        label: 'Your prediction',
      };
      retryExample = {
        role,
        values: [2, 6],
        revealAnswer: true,
        label: 'Simpler worked example',
      };
    }
    if (i === 3 || i === 4 || i === 5)
      retryExample = {
        role: i === 5 ? 'MAX' : 'MIN',
        values: i === 3 ? [4, 8] : i === 4 ? [7, 2] : [4, 3, 2],
        revealAnswer: true,
        label: 'Second worked example',
      };
    const items: [string, string[], string[], string][] = [
      [
        'Can MAX promise the largest leaf if the opponent controls the next choice?',
        ['Yes', 'No'],
        ['No'],
        'No. The opponent can choose the smaller outcome.',
      ],
      [
        'A new MAX node can choose 3 or 8. Which score does MAX choose?',
        ['3', '8'],
        ['8'],
        'MAX chooses max(3,8)=8 because larger scores benefit MAX.',
      ],
      [
        'Now MIN can choose 1 or 7. Which gives MAX the least favorable result?',
        ['1', '7'],
        ['1'],
        'MIN chooses min(1,7)=1. The score is measured for MAX, so the opponent prefers the smaller score.',
      ],
      [
        'A different MIN node has 4 and 8. What does it return?',
        ['4', '8'],
        ['4'],
        'It returns min(4,8)=4. A possible 8 is not a guarantee.',
      ],
      [
        'A different MIN node has 7 on the left and 2 on the right. What does it return?',
        ['7', '2'],
        ['2'],
        'The minimum is 2; drawing order does not change MIN’s rule.',
      ],
      [
        'MAX receives guarantees 4, 3 and 2 in a new tree. What value returns to the root?',
        ['4', '3', '2'],
        ['4'],
        'MAX keeps the largest guarantee, max(4,3,2)=4.',
      ],
      [
        'New tree: A=min(4,7), B=min(3,8), C=min(2,6). Which first branch should MAX choose?',
        ['A', 'B', 'C'],
        ['A'],
        'A guarantees 4, better than B’s 3 and C’s 2.',
      ],
      [
        'Can a skipped leaf change the answer after a valid bound proves it cannot improve MAX’s choice?',
        ['Yes', 'No'],
        ['No'],
        'The proof of the bound is what makes skipping safe.',
      ],
      [
        'In a new example alpha=4 and a MIN branch already has a child of 3. Can its remaining leaf be skipped?',
        ['Yes', 'No'],
        ['Yes'],
        'Beta is at most 3 ≤ alpha 4, so that MIN branch cannot improve MAX’s available 4.',
      ],
      [
        tree[2]![0]! > mm.children[0]!
          ? 'If alpha=4 and the first MIN child is 6, must we inspect its remaining child?'
          : 'If alpha=4 and the first MIN child is 2, can the remaining child be skipped?',
        ['Yes', 'No'],
        ['Yes'],
        tree[2]![0]! > mm.children[0]!
          ? 'Beta 6 is above alpha 4; no cutoff has been proved.'
          : 'Beta is at most 2, below alpha 4; the branch cannot improve the choice.',
      ],
      [
        `This traversal has six leaves and skips ${pass.skipped}. How many are actually evaluated?`,
        ['4', '5', '6'],
        [String(pass.visited)],
        `${pass.visited} evaluated plus ${pass.skipped} skipped accounts for six leaves.`,
      ],
      [
        'New tree: A=min(4,7), B=min(3,8), C=min(2,6). Which branch gives MAX the best guarantee?',
        ['A', 'B', 'C'],
        ['A'],
        'A guarantees 4. B guarantees 3 and C guarantees 2.',
      ],
    ];
    followup = follow(q, ...items[i]!);
    if (i <= 5 && i >= 1)
      followupExample = {
        role: i === 1 || i === 5 ? 'MAX' : 'MIN',
        values:
          i === 1
            ? [3, 8]
            : i === 2
              ? [1, 7]
              : i === 3
                ? [4, 8]
                : i === 4
                  ? [7, 2]
                  : [4, 3, 2],
        revealAnswer: false,
        label: 'Follow-up prediction',
      };
  } else if (lesson.id === 'ai4') {
    target =
      i === 6 || i === 10
        ? 'CanFly(Tweety)'
        : i === 2 || i === 3
          ? 'rule'
          : i === 0 || i === 1
            ? 'Bird(Tweety)'
            : 'HasWings(Tweety)';
    const items: [string, string[], string[], string][] = [
      [
        'A second agent stores Bird(Rio) and a general wings rule. What kind of information is this?',
        ['Facts and rules', 'Only a final answer'],
        ['Facts and rules'],
        'Bird(Rio) is a fact; the general implication is a rule.',
      ],
      [
        'To add Bird(Rio) to stored knowledge, which operation should we use?',
        ['TELL', 'ASK'],
        ['TELL'],
        'TELL stores a statement. ASK queries what follows.',
      ],
      [
        'Is Bird(x) → HasWings(x) a statement about just one named individual?',
        ['No; it is a general rule', 'Yes; it is a single named fact'],
        ['No; it is a general rule'],
        'The variable lets the rule match multiple individual bird facts.',
      ],
      [
        'For Bird(Rio), what replaces x throughout the wings rule?',
        ['Rio', 'HasWings'],
        ['Rio'],
        'The same entity, Rio, replaces x in the premise and conclusion.',
      ],
      [
        'Given Bird(Rio) and the wings rule, what can be derived?',
        ['HasWings(Rio)', 'CanFly(Rio)'],
        ['HasWings(Rio)'],
        'The stored bird premise and wings rule support wings for Rio.',
      ],
      [
        'The wings query has a path from Bird(Rio) through the wings rule. Is it supported?',
        ['Yes', 'No'],
        ['Yes'],
        'That explicit path establishes entailment in this permitted toy knowledge base.',
      ],
      [
        'A second KB has Bird(Rio) and only a wings rule. Is CanFly(Rio) disproved?',
        ['No; it is not established', 'Yes; absence proves false'],
        ['No; it is not established'],
        'Missing flight support is not a disproof.',
      ],
      [
        'Starting from Bird(Rio) and applying a rule to derive wings is which direction?',
        ['Forward chaining', 'Backward chaining'],
        ['Forward chaining'],
        'Forward chaining starts with the known fact.',
      ],
      [
        'To work backward from HasWings(Rio), what premise should we seek?',
        ['Bird(Rio)', 'CanFly(Rio)'],
        ['Bird(Rio)'],
        'The wings rule needs the matching bird premise.',
      ],
      [
        'Can the wings rule support Rio without any matching Rio fact?',
        ['No; it needs Bird(Rio)', 'Yes; Tweety automatically proves Rio'],
        ['No; it needs Bird(Rio)'],
        'A new entity needs its own supporting premise.',
      ],
      [
        'Which arrow has no matching stored rule here?',
        ['Bird(Rio) → CanFly(Rio)', 'Bird(Rio) → HasWings(Rio)'],
        ['Bird(Rio) → CanFly(Rio)'],
        'Only the wings rule is stored; the flight arrow lacks support.',
      ],
      [
        'Which operation adds a fact and which checks support?',
        ['TELL adds; ASK queries', 'ASK adds; TELL queries'],
        ['TELL adds; ASK queries'],
        'TELL changes the represented knowledge; ASK seeks a supported consequence.',
      ],
    ];
    followup = follow(q, ...items[i]!);
  } else if (lesson.id === 'ehs3') {
    target = [
      'edge',
      'edge',
      'tools',
      'power',
      'wheel',
      'ladder',
      'wheel',
      'wheel',
      'edge',
      'ladder',
      'excavation',
      'edge',
    ][i]!;
    const items: [string, string[], string[], string][] = [
      [
        'A second platform has an open edge. Which risk does that feature create?',
        ['A fall from height', 'Only paint fading'],
        ['A fall from height'],
        'An exposed elevated edge is connected to falling from height.',
      ],
      [
        'Which part needs a barrier in this illustration?',
        ['The exposed platform edge', 'The power line'],
        ['The exposed platform edge'],
        'The barrier belongs at the exposed platform edge.',
      ],
      [
        'A loose object sits by an elevated edge. What pathway should its control address?',
        ['Falling onto someone below', 'Only paint fading'],
        ['Falling onto someone below'],
        'Securing the object addresses the falling-object risk.',
      ],
      [
        'Which feature needs electrical-hazard attention?',
        ['The overhead power line', 'The tool box color'],
        ['The overhead power line'],
        'The nearby power line is the electrical feature; this illustration supplies no clearance distance.',
      ],
      [
        'Can a tower with an unstable base be treated as stable because its top looks tidy?',
        ['No', 'Yes'],
        ['No'],
        'Stability depends on support, not on appearance.',
      ],
      [
        'In these module notes, is a tower intended to support a ladder balanced on it?',
        ['No', 'Yes'],
        ['No'],
        'The module identifies this tower misuse as an overturning concern.',
      ],
      [
        'Which base condition addresses movement and instability?',
        [
          'Firm level support with secured wheels',
          'Uneven ground and free wheels',
        ],
        ['Firm level support with secured wheels'],
        'The support and wheel conditions address the illustrated instability.',
      ],
      [
        'According to the notes, should materials remain on a tower while it is moved?',
        ['No', 'Yes'],
        ['No'],
        'The module warns against moving a tower with people or materials on it.',
      ],
      [
        'Which change directly addresses the illustrated open-edge risk?',
        ['A suitable barrier at the edge', 'A new paint color'],
        ['A suitable barrier at the edge'],
        'A barrier addresses the fall pathway; paint does not.',
      ],
      [
        'Classify dismantling a tower and slipping during work on it.',
        ['Setup-stage hazard; use hazard', 'Use hazard; setup-stage hazard'],
        ['Setup-stage hazard; use hazard'],
        'Dismantling belongs to the assembly/alteration/dismantling stage; slipping occurs during use.',
      ],
      [
        'In the excavation illustration, which feature creates collapse risk?',
        ['Unsupported sidewall', 'Secured tool box'],
        ['Unsupported sidewall'],
        'The unsupported earth sidewall is linked to collapse.',
      ],
      [
        'Which pair connects a visible hazard to its matching control?',
        [
          'Loose elevated tool → secured storage',
          'Open edge → new paint color',
        ],
        ['Loose elevated tool → secured storage'],
        'Secured storage addresses a loose object that could fall. Educational practice only.',
      ],
    ];
    followup = follow(q, ...items[i]!);
  } else if (lesson.id === 'ehs5') {
    target = [
      'sewage',
      'sewage',
      'sewage',
      'runoff',
      'runoff',
      'waste',
      'oil',
      'sewage',
      'waste',
      'sewage',
      'runoff',
      'waste',
    ][i]!;
    const items: [string, string[], string[], string][] = [
      [
        'After identifying a discharge hazard, what makes an inspection useful?',
        ['Recommend a matching corrective action', 'Guarantee no future risk'],
        ['Recommend a matching corrective action'],
        'Inspection connects recognition with appropriate correction, without guaranteeing zero risk.',
      ],
      [
        'Which source enters by the town pipe rather than washing over a field?',
        ['Untreated wastewater', 'Farm runoff'],
        ['Untreated wastewater'],
        'The visible outfall is the direct wastewater pathway.',
      ],
      [
        'Another outfall carries untreated sewage. Where should its control act?',
        ['Before discharge', 'After assuming dilution makes it safe'],
        ['Before discharge'],
        'Treatment before discharge addresses this source.',
      ],
      [
        'Rain carries chemicals from a field. Which pathway is this?',
        ['Farm runoff', 'Town wastewater pipe'],
        ['Farm runoff'],
        'Runoff washes chemicals from land toward water.',
      ],
      [
        'Does treating the town outfall alone control the farm chemical source?',
        ['No', 'Yes'],
        ['No'],
        'Farm runoff is a separate source; reducing excess chemicals addresses it.',
      ],
      [
        'What change addresses dumped waste entering water?',
        [
          'Collect and dispose of waste appropriately',
          'Assume water makes rubbish harmless',
        ],
        ['Collect and dispose of waste appropriately'],
        'Collection and suitable disposal interrupt the solid-waste pathway.',
      ],
      [
        'Should cooking grease be poured into a drain in this example?',
        ['No', 'Yes'],
        ['No'],
        'Keeping grease out of drains addresses that distinct pathway.',
      ],
      [
        'One outfall is treated. Does that establish that river water is drinkable?',
        ['No', 'Yes'],
        ['No'],
        'One control does not establish drinking safety or remove all other sources.',
      ],
      [
        'Which individual action conserves water?',
        ['Repair a dripping tap', 'Leave a tap running'],
        ['Repair a dripping tap'],
        'Repair prevents unnecessary water loss.',
      ],
      [
        'Which sequence connects an observation to action?',
        [
          'Spot discharge → propose its matching control',
          'Spot discharge → ignore it',
        ],
        ['Spot discharge → propose its matching control'],
        'The corrective action should address the actual observed source.',
      ],
      [
        'After town treatment, do farm, waste and oil pathways still need matching controls?',
        ['Yes', 'No'],
        ['Yes'],
        'Each remaining pathway needs its own prevention; one intervention is insufficient.',
      ],
      [
        'Which plan connects source, pathway and prevention?',
        [
          'Excess fertilizer → runoff → reduce excess use',
          'Excess fertilizer → assume clear water is safe',
        ],
        ['Excess fertilizer → runoff → reduce excess use'],
        'The first plan identifies a source, its route to water and a matching prevention.',
      ],
    ];
    followup = follow(q, ...items[i]!);
  } else if (lesson.id === 'open-ai') {
    target = i < 3 ? 'input' : i === 5 ? 'weight' : 'output';
    const items: [string, string[], string[], string][] = [
      [
        'Is predicting a pattern a claim to know every future event?',
        ['No', 'Yes'],
        ['No'],
        'A prediction has limits and can be checked against outcomes.',
      ],
      [
        'To learn a labeled pattern, which data help?',
        ['Relevant input-target pairs', 'Only unsupported guesses'],
        ['Relevant input-target pairs'],
        'Examples connect inputs with targets that provide useful feedback.',
      ],
      [
        'In a second connection, 4 enters and 2 comes out. Which is the input?',
        ['4', '2'],
        ['4'],
        'The input is the number entering the model.',
      ],
      [
        'Another tiny model has input 4 and weight 0.5. What is its output?',
        ['2', '4', '8'],
        ['2'],
        'The toy calculation is 4 × 0.5 = 2.',
      ],
      [
        'Prediction 2 and target 5 have what absolute error?',
        ['3', '7'],
        ['3'],
        'The absolute distance |5−2| is 3.',
      ],
      [
        'At fixed input 2, does raising weight from 0.5 to 1.5 change the output?',
        ['Yes', 'No'],
        ['Yes'],
        'The multiplication changes from 1 to 3.',
      ],
      [
        'Input 3 with weight 1.5 gives which prediction?',
        ['4.5', '1.5'],
        ['4.5'],
        '3 × 1.5 = 4.5. A different input checks the same rule.',
      ],
      [
        'A model fits one example. Does that prove it works on every new input?',
        ['No', 'Yes'],
        ['No'],
        'One fit does not establish general usefulness.',
      ],
    ];
    followup = follow(q, ...items[i]!);
  } else {
    target = i === 0 ? 'earth' : 'traveler';
    const items: [string, string[], string[], string][] = [
      [
        'Which is a measurable claim?',
        [
          'Two clocks accumulate different elapsed times',
          'A story portal must be real',
        ],
        ['Two clocks accumulate different elapsed times'],
        'The clock claim can be compared with measurements; a fictional story is not physical evidence.',
      ],
      [
        'In this model, what does the second clock represent?',
        ['Traveler proper time', 'A fictional portal'],
        ['Traveler proper time'],
        'It is the elapsed time recorded by the idealized traveler.',
      ],
      [
        'At 0.6c the traveler records eight years for ten Earth-frame years. Is either interval negative?',
        ['No', 'Yes'],
        ['No'],
        'Both intervals are positive; less elapsed time is not backward time.',
      ],
      [
        'For the same Earth interval, does 0.8c give less traveler time than 0.6c?',
        ['Yes', 'No'],
        ['Yes'],
        'The formula gives a smaller square-root factor at the higher speed.',
      ],
      [
        'For five Earth-frame years at 0.8c, how many traveler years does the formula give?',
        ['3', '5'],
        ['3'],
        '5 × √(1−0.8²) = 5 × 0.6 = 3 years.',
      ],
      [
        'Does this constant-speed comparison include acceleration and turnaround?',
        ['No', 'Yes'],
        ['No'],
        'Those journey details, along with gravity, are outside the model.',
      ],
      [
        'Do these positive elapsed-time readings establish travel into the past?',
        ['No', 'Yes'],
        ['No'],
        'They illustrate a forward clock comparison, not established backward travel.',
      ],
      [
        'Which statement stays within the model’s evidence?',
        [
          'Elapsed times differ under the stated assumptions',
          'A past-travel portal is established',
        ],
        ['Elapsed times differ under the stated assumptions'],
        'The calculation supports the elapsed-time comparison and does not establish a portal.',
      ],
    ];
    followup = follow(q, ...items[i]!);
  }

  if (
    lesson.id === 'ai3' &&
    (i === 1 || i === 2) &&
    (state.questionAttempt > 1 || state.teaching.practiceCount > 0)
  ) {
    const role = i === 1 ? 'MAX' : 'MIN';
    retryExample = {
      role,
      values: [1, 2],
      revealAnswer: true,
      label: 'One small choice',
    };
    followupExample = {
      role,
      values: [0, 3],
      revealAnswer: false,
      label: 'Try a new pair',
    };
    followup = follow(
      q,
      `${role} can choose 0 or 3. Which score does ${role} choose?`,
      ['0', '3'],
      [role === 'MIN' ? '0' : '3'],
      `${role} chooses ${role === 'MIN' ? 'min(0,3)=0' : 'max(0,3)=3'} using the same rule.`,
    );
  }
  const cBound =
    lesson.id === 'ai3' &&
    i === 9 &&
    state.visualState.kind === 'tree' &&
    state.visualState.treeOrder !== 'v2';
  return {
    introduction: cBound
      ? 'A MIN branch can be cut off as soon as its upper bound is no greater than MAX’s available guarantee.'
      : row[0]!,
    simpler: row[1]!,
    demonstration: row[2]!,
    example: retryExample
      ? `${retryExample.role} compares ${retryExample.values.join(' and ')} and chooses ${retryExample.role === 'MIN' ? Math.min(...retryExample.values) : Math.max(...retryExample.values)}.`
      : secondExamples[lesson.id]![i]!,
    followup,
    target,
    demoExample,
    checkExample,
    retryExample,
    followupExample,
  };
}
