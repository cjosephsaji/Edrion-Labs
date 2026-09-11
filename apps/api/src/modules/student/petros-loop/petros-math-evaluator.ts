import { derivative, parse, rationalize, simplify, type MathNode } from 'mathjs';
import { PETROS_EVALUATION_SCHEMA_VERSION, type PetrosAnswerEvaluation } from '@edrion/schemas';

export type PetrosExpectedMathAnswer =
  | { kind: 'numeric'; value: number; tolerance: number; unit: string | null }
  | { kind: 'expression'; expression: string; variables: string[]; domain: Record<string, { min: number; max: number }>; allowAdditiveConstant: boolean };

const FUNCTIONS = new Set(['sqrt', 'abs', 'exp', 'log', 'sin', 'cos', 'tan']);
const NODE_TYPES = new Set(['ConstantNode', 'SymbolNode', 'OperatorNode', 'FunctionNode', 'ParenthesisNode']);

function checkedNode(source: string, contract: Extract<PetrosExpectedMathAnswer, { kind: 'expression' }>) {
  if (source.length > 240 || /[;={}[\]]/.test(source)) throw new Error('Unsupported mathematical syntax.');
  const variables = contract.variables.filter(
    (variable) => !(contract.allowAdditiveConstant && variable === 'C'),
  );
  if (!variables.length) throw new Error('At least one independent variable is required.');
  const node = parse(source);
  node.traverse((child: MathNode) => {
    if (!NODE_TYPES.has(child.type)) throw new Error(`Unsupported mathematical construct: ${child.type}.`);
    const record = child as unknown as { type: string; name?: string; op?: string; args?: MathNode[] };
    const isIntegrationConstant = contract.allowAdditiveConstant && record.name === 'C';
    if (record.type === 'SymbolNode' && record.name && !variables.includes(record.name) && !['e', 'pi'].includes(record.name) && !isIntegrationConstant) {
      throw new Error(`Unexpected symbol ${record.name}.`);
    }
    if (record.type === 'FunctionNode' && (!record.name || !FUNCTIONS.has(record.name))) throw new Error(`Unsupported function ${record.name ?? ''}.`);
    if (record.type === 'OperatorNode' && record.op && !['+', '-', '*', '/', '^'].includes(record.op)) throw new Error(`Unsupported operator ${record.op}.`);
    if (record.type === 'OperatorNode' && record.op === '/') {
      const denominator = record.args?.[1];
      if (denominator && denominator.toString().match(new RegExp(`\\b(${variables.join('|')})\\b`))) {
        throw new Error('Variable denominators require a richer domain proof and are intentionally ungraded.');
      }
    }
  });
  for (const variable of variables) {
    const domain = contract.domain[variable];
    if (!domain || !(domain.min < domain.max)) throw new Error(`A valid domain is required for ${variable}.`);
  }
  return node;
}

export function validateExpectedMathAnswer(contract: PetrosExpectedMathAnswer) {
  if (contract.kind === 'numeric') {
    if (!Number.isFinite(contract.value) || !Number.isFinite(contract.tolerance) || contract.tolerance < 0) throw new Error('Invalid numeric answer contract.');
    return contract;
  }
  checkedNode(contract.expression, contract);
  return contract;
}

export function evaluateExpectedMathAnswer(contract: PetrosExpectedMathAnswer, rawAnswer: string, hint: string): PetrosAnswerEvaluation {
  const answer = rawAnswer.trim();
  if (!answer) return result('invalid', 0, 'Enter a mathematical answer before checking.', 'invalid_input', hint);
  try {
    if (contract.kind === 'numeric') {
      const match = answer.match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([^\d\s].*)?$/i);
      if (!match) return result('invalid', 0, 'Use a number followed by its unit when one is requested.', 'invalid_input', hint);
      const value = Number(match[1]);
      const unit = (match[2] ?? '').trim().toLowerCase().replaceAll(' ', '');
      const expectedUnit = (contract.unit ?? '').trim().toLowerCase().replaceAll(' ', '');
      if (expectedUnit && unit !== expectedUnit) return result('incorrect', 0, `The numerical form is readable, but the required unit is ${contract.unit}.`, 'calculation_slip', hint);
      const delta = Math.abs(value - contract.value);
      return delta <= contract.tolerance
        ? result('correct', 1, 'The value matches the registered mathematical answer and tolerance.', 'none', null)
        : result('incorrect', 0, 'The value is outside the accepted tolerance. Recheck the method and arithmetic.', 'calculation_slip', hint);
    }
    const expected = checkedNode(contract.expression, contract);
    const supplied = checkedNode(answer, contract);
    const independentVariable = contract.variables.find(
      (variable) => !(contract.allowAdditiveConstant && variable === 'C'),
    );
    const difference = contract.allowAdditiveConstant
      ? derivative(`(${supplied.toString()})-(${expected.toString()})`, independentVariable!).toString()
      : `(${supplied.toString()})-(${expected.toString()})`;
    const reduced = rationalize(simplify(difference)).toString();
    return reduced === '0'
      ? result('correct', 1, contract.allowAdditiveConstant ? 'The derivatives are symbolically identical on the declared domain, so the answers differ by at most a constant.' : 'The expressions are symbolically identical on the declared domain.', 'none', null)
      : result('incorrect', 0, 'The expression is not symbolically equivalent under the registered domain and answer rule.', 'procedure_gap', hint);
  } catch (error) {
    return result('invalid', 0, error instanceof Error ? error.message : 'This expression is outside the supported safe syntax.', 'invalid_input', hint);
  }
}

function result(correctness: PetrosAnswerEvaluation['correctness'], credit: number, feedback: string, errorClass: PetrosAnswerEvaluation['errorClass'], hint: string | null): PetrosAnswerEvaluation {
  return { schemaVersion: PETROS_EVALUATION_SCHEMA_VERSION, correctness, credit, evidence: [feedback], errorClass, misconception: null, feedback, safeNextHint: hint };
}
