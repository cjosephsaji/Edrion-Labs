import { MemoryStick, Server, ArrowRight, Calculator } from 'lucide-react';
import type { EquationStep } from '@edrion/schemas';
import styles from './equation-board.module.css';

/** Draw the server-checked example. Never calculate or judge a student answer. */
export function EquationModel({ step }: { step: EquationStep }) {
  const [first, second] = step.inputs;
  if (!first) return null;
  if (
    step.rule === 'subtract' &&
    first.unit === 'GB' &&
    second?.unit === 'GB' &&
    step.result.unit === 'GB' &&
    first.value > 0 &&
    second.value >= 0 &&
    step.result.value >= 0
  ) {
    return (
      <figure className={styles.model} aria-label="Memory allocation example">
        <figcaption>
          <MemoryStick size={18} aria-hidden="true" /> Where the memory goes
        </figcaption>
        <div className={styles.barHeading}>
          <span>Starting memory</span>
          <strong>{first.value} GB</strong>
        </div>
        <div className={styles.memoryBar} aria-hidden="true">
          {second.value > 0 && (
            <div className={styles.reserved} style={{ flexGrow: second.value }}>
              <strong>{second.value} GB</strong>
            </div>
          )}
          {step.result.value > 0 && (
            <div className={styles.available} style={{ flexGrow: step.result.value }}>
              <strong>{step.result.value} GB</strong>
            </div>
          )}
        </div>
        <ul className={styles.legend}>
          <li>
            <i className={styles.reservedSwatch} aria-hidden="true" />
            {second.value} GB set aside
          </li>
          <li>
            <i className={styles.availableSwatch} aria-hidden="true" />
            {step.result.value} GB available
          </li>
        </ul>
        <p className={styles.modelSummary}>
          Of {first.value} GB, {second.value} GB is set aside, leaving {step.result.value}{' '}
          GB available.
        </p>
      </figure>
    );
  }
  if (
    step.rule === 'divide' &&
    first.unit === 'GB' &&
    second?.unit === 'GB/VM' &&
    step.result.unit === 'VM' &&
    second.value > 0 &&
    Number.isInteger(step.result.value) &&
    step.result.value >= 0
  ) {
    const shown = Math.min(12, step.result.value);
    return (
      <figure className={styles.model} aria-label="Equal VM groups example">
        <figcaption>
          <Server size={18} aria-hidden="true" /> Fit VMs into the available memory
        </figcaption>
        <div className={styles.groupHeading}>
          <span>
            <strong>{first.value} GB</strong> available
          </span>
          <span>
            <strong>{second.value} GB</strong> per VM
          </span>
        </div>
        <div className={styles.vmGroups} aria-hidden="true">
          {Array.from({ length: shown }, (_, i) => (
            <div className={styles.vm} key={i}>
              <Server size={19} />
              <strong>VM {i + 1}</strong>
              <span>{second.value} GB</span>
            </div>
          ))}
          {shown < step.result.value && (
            <div className={styles.moreGroups}>+{step.result.value - shown} more VMs</div>
          )}
        </div>
        <p className={styles.modelSummary}>
          Each VM takes one {second.value} GB group. The worked example fits{' '}
          <strong>{step.result.value} whole VMs</strong>.
        </p>
      </figure>
    );
  }
  const symbol = { add: '+', subtract: '−', multiply: '×', divide: '÷', floor: 'floor' }[
    step.rule
  ];
  const unit = (value: typeof first) => (value.unit === '1' ? '' : value.unit);
  if (
    (step.rule === 'add' || step.rule === 'subtract') &&
    second &&
    first.unit === second.unit &&
    first.value >= 0 &&
    second.value >= 0 &&
    step.result.value >= 0
  ) {
    const parts = step.rule === 'add' ? [first, second] : [second, step.result];
    return (
      <figure className={styles.model} aria-label="Part and whole example">
        <figcaption>
          <Calculator size={18} aria-hidden="true" />
          See the quantities as parts of a whole
        </figcaption>
        <div className={styles.memoryBar} aria-hidden="true">
          {parts.map((part, i) => (
            <div
              key={i}
              className={i === 0 ? styles.reserved : styles.available}
              style={{ flexGrow: part.value || 0.00001 }}
            >
              <strong>
                {part.value} {unit(part)}
              </strong>
            </div>
          ))}
        </div>
        <p className={styles.modelSummary}>
          {first.value} {unit(first)} {symbol} {second.value} {unit(second)} ={' '}
          <strong>
            {step.result.value} {unit(step.result)}
          </strong>
          . Values from the checked example.
        </p>
      </figure>
    );
  }
  return (
    <figure className={styles.model} aria-label="Quantity flow example">
      <figcaption>
        <Calculator size={18} aria-hidden="true" />
        Follow the quantities and their units
      </figcaption>
      <div className={styles.quantityFlow}>
        {step.inputs.map((input, i) => (
          <div className={styles.quantityInput} key={i}>
            <span>Input {i + 1}</span>
            <strong>{input.value}</strong>
            <small>{unit(input) || 'unitless'}</small>
            {i === 0 && step.inputs.length > 1 && (
              <b className={styles.operator}>{symbol}</b>
            )}
          </div>
        ))}
        <ArrowRight size={22} aria-hidden="true" />
        <div className={styles.quantityResult}>
          <span>{step.rule === 'floor' ? 'Whole value' : 'Checked result'}</span>
          <strong>{step.result.value}</strong>
          <small>{unit(step.result) || 'unitless'}</small>
        </div>
      </div>
    </figure>
  );
}
