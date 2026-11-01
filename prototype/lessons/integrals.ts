import {
  makeTopicLesson,
  type TopicCheck,
  type TopicOutline,
} from '../teaching/topic-content';

const check = (
  task: string,
  options: string[],
  correctIndex: number,
  explanation: string,
): TopicCheck => ({
  task,
  options,
  correctIndex,
  explanation,
  feedback: options.map((_, i) =>
    i === correctIndex
      ? explanation
      : `This choice does not match the relationship in the example. ${explanation}`,
  ),
});
const outline: TopicOutline = {
  learningGoals: [
    'Explain integration as accumulation of small contributions.',
    'Compare rectangle approximations with an exact definite integral.',
    'Connect signed area and antiderivatives.',
  ],
  prerequisites: [
    'Multiplication, rectangle and triangle areas, and basic function notation.',
  ],
  title: 'How do integrals work?',
  subtitle: 'Small pieces. A running total. The area under a curve.',
  introduction:
    'An integral adds up many small contributions. We will start with distance, build an area from rectangles, and connect that total to an antiderivative.',
  steps: [
    {
      concept: 'Adding small contributions',
      introduction:
        'A rate tells you how fast something changes. To find the accumulated amount, add rate times small intervals. At constant speed, that is distance = speed times time.',
      demonstration:
        'Travel at 2 metres per second for 3 seconds. Each second contributes 2 metres, so the total is 2 + 2 + 2 = 6 metres. An integral extends this idea to a rate that varies.',
      simpler:
        'A total can be built from little pieces. Add the distance from each short part of a journey.',
      example:
        'A tap adds 3 litres each minute. After 2 minutes, 3 + 3 = 6 litres have accumulated.',
      diagramLabels: ['Rate', 'Small interval', 'Contribution to total'],
      diagramCaption:
        'Rate × interval gives one contribution; add contributions to find the accumulated amount.',
      check: check(
        'At a constant 4 metres per second for 2 seconds, how far do you travel?',
        ['8 metres', '2 metres', '6 metres'],
        0,
        'Each of the 2 seconds adds 4 metres: 4 × 2 = 8 metres.',
      ),
      followup: check(
        'A tap adds 5 litres per minute for 3 minutes. How much water is added?',
        ['15 litres', '8 litres', '5 litres'],
        0,
        '5 litres each minute for 3 minutes gives 5 × 3 = 15 litres.',
      ),
    },
    {
      concept: 'Build rectangles under a curve',
      introduction:
        'For a changing rate, divide the interval into small pieces. Approximate each piece with a rectangle: its width is the interval length and its height is a sampled function value.',
      demonstration:
        'For f(x) = x from 0 to 2, four rectangles have width 2 ÷ 4 = 0.5. Left-endpoint heights are 0, 0.5, 1 and 1.5. Their areas add to 1.5 square units.',
      simpler:
        'Each rectangle has area height × width. Add those little areas to approximate the area under the line.',
      example:
        'Split an interval of length 4 into 8 equal pieces. Each piece has width 4 ÷ 8 = 0.5.',
      diagramLabels: [
        'Divide the interval',
        'Height × width',
        'Add rectangle areas',
      ],
      diagramCaption:
        'The shaded rectangles sample the left endpoint. The first has height zero. This is an approximation, not the exact integral.',
      check: check(
        'Split the interval from 0 to 3 into 6 equal pieces. What is each width?',
        ['0.5', '3', '6'],
        0,
        'The interval length is 3, so each of 6 equal pieces has width 3 ÷ 6 = 0.5.',
      ),
      followup: check(
        'Split the interval from 0 to 2 into 8 equal pieces. What is each width?',
        ['0.25', '0.5', '4'],
        0,
        'Width = interval length ÷ number of pieces = 2 ÷ 8 = 0.25.',
      ),
    },
    {
      concept: 'Make the approximation more accurate',
      introduction:
        'For this increasing straight line, left-endpoint rectangles sit below the curve. Increasing their number makes them narrower and reduces the gap.',
      demonstration:
        'Use 4, 8, 16 and 32 pieces in the model. The left sums approach 2 for f(x) = x on [0,2]. The exact area is the triangle with base 2 and height 2: one half × 2 × 2 = 2.',
      simpler:
        'Narrower rectangles follow this line more closely. The total approaches a limit instead of becoming exact at some fixed number of pieces.',
      example:
        'With 4 pieces the left sum is 1.5. With 8 it is 1.75. Both are below 2, and 1.75 is closer.',
      diagramLabels: ['More pieces', 'Narrower rectangles', 'Smaller gap'],
      diagramCaption:
        'For this increasing line, the left sum approaches the exact triangle area from below. This does not claim every function has the same error pattern.',
      check: check(
        'For this line and interval, which left-endpoint approximation is closer to the exact area?',
        ['32 pieces', '4 pieces', 'Both are always exact'],
        0,
        'For f(x) = x on a fixed positive interval, more equal left-endpoint pieces reduce the missing triangular gaps.',
      ),
      followup: check(
        'For f(x) = 2x on [0,2], left sums are 3 with 4 pieces and 3.5 with 8 pieces. Which is closer to the exact integral 4?',
        ['3.5', '3', 'Both have the same error'],
        0,
        'The error is 0.5 for 3.5, smaller than the error of 1 for 3.',
      ),
    },
    {
      concept: 'A definite integral is a total',
      introduction:
        'A definite integral has a start and an end. The notation ∫ from a to b of f(x) dx describes the limiting signed total over that interval.',
      demonstration:
        'For the line f(x) = x from 0 to 2, the exact area is 2. The integral is a number for that particular interval. Changing the upper limit changes the total.',
      simpler:
        'The two limits tell us where to start adding and where to stop.',
      example:
        'On [0,4], f(x) = x makes a triangle with base 4 and height 4. Its area is one half × 4 × 4 = 8.',
      diagramLabels: [
        'Choose start and end',
        'Accumulate between them',
        'One definite total',
      ],
      diagramCaption:
        'This model is specifically the positive line f(x) = m x on [0,b]. Its exact integral is m b² / 2.',
      check: check(
        'What is the exact integral of f(x) = x from 0 to 3?',
        ['4.5', '3', '9'],
        0,
        'The region is a triangle with base 3 and height 3. Its area is one half × 3 × 3 = 4.5.',
      ),
      followup: check(
        'What is the exact integral of f(x) = 2x from 0 to 3?',
        ['9', '6', '18'],
        0,
        'The triangle has base 3 and height 6, so its area is one half × 3 × 6 = 9.',
      ),
    },
    {
      concept: 'Signed area can cancel',
      introduction:
        'A definite integral counts contributions above the x-axis positively and contributions below it negatively. Net signed area can differ from total geometric area.',
      demonstration:
        'If one part contributes +5 and another contributes −2, the integral is 5 − 2 = 3. The total geometric area would be 5 + 2 = 7. Our plotted line stays above the axis, so it has no negative contribution.',
      simpler:
        'Above the axis adds to the signed total; below the axis subtracts from it.',
      example:
        'A contribution of +4 and a contribution of −6 combine to −2. The negative part is larger in magnitude.',
      diagramLabels: [
        'Above the axis: positive',
        'Below the axis: negative',
        'Combine with signs',
      ],
      diagramCaption:
        'Signed area and geometric area are different quantities when a function crosses the x-axis. The plotted positive line is a special case.',
      check: check(
        'A region below the x-axis has geometric area 3. What is its signed contribution?',
        ['−3', '3', '0'],
        0,
        'A region below the x-axis contributes negatively: its signed contribution is −3.',
      ),
      followup: check(
        'An interval has contributions +7 and −3. What is the definite integral?',
        ['4', '10', '−4'],
        0,
        'Add the signed contributions: 7 + (−3) = 4.',
      ),
    },
    {
      concept: 'Connect integrals and derivatives',
      introduction:
        'An antiderivative of f is a function F whose derivative is f. For a continuous function, the fundamental theorem of calculus lets us evaluate a definite integral as F(b) − F(a).',
      demonstration:
        'For f(x) = x, choose F(x) = x² / 2. On [0,2], F(2) − F(0) = 2 − 0 = 2. The result agrees with the area model. An indefinite integral describes the family x² / 2 + C.',
      simpler:
        'Differentiation asks for the rate of change. Antidifferentiation recovers a function with that rate. A definite integral uses its values at the two endpoints.',
      example:
        'On [1,3], F(3) − F(1) = 9/2 − 1/2 = 4. The same constant C would appear at both endpoints and cancel.',
      diagramLabels: [
        'Find an antiderivative F',
        'Evaluate both endpoints',
        'Subtract F(b) − F(a)',
      ],
      diagramCaption:
        'For continuous f, ∫ from a to b of f(x) dx = F(b) − F(a). An indefinite integral includes an arbitrary constant C.',
      check: check(
        'Which is an antiderivative of f(x) = x?',
        ['x² / 2 + C', 'x + C', '2x + C'],
        0,
        'Differentiating x² / 2 + C gives x; the derivative of a constant is zero.',
      ),
      followup: check(
        'Why does the arbitrary constant not affect F(b) − F(a)?',
        [
          'The same constant cancels in subtraction',
          'Every constant must equal zero',
          'The endpoints must be equal',
        ],
        0,
        '(F(b) + C) − (F(a) + C) = F(b) − F(a). The two copies of C cancel.',
      ),
    },
  ],
};
export const integrals = makeTopicLesson(
  outline,
  'prepared',
  'topic-integrals',
);
for (const q of integrals.questions)
  q.teaching!.diagram.area = { slope: 1, upper: 2, slices: 4 };
