'use client';

import type { LearnSessionV1Dto } from '@edrion/schemas';



/**

 * Segmented progress: checkpoint segments + subtle move ticks (hyperspec 2 AC-3).

 */

export function SessionProgressBar({ session }: { session: LearnSessionV1Dto }) {

  const total = Math.max(session.checkpointsTotal, 1);

  const done = Math.min(session.checkpointsDone, total);

  const moveTotal = Math.max(session.planMoveCount, session.blocks.length, 1);

  const moveDone = session.blocks.length;



  return (

    <div className="space-y-1">

      <div

        className="flex h-1 w-full gap-0.5 overflow-hidden"

        style={{ height: 4 }}

        role="progressbar"

        aria-valuenow={done}

        aria-valuemin={0}

        aria-valuemax={total}

        aria-label={`Lesson progress: ${done} of ${total} checkpoints`}

      >

        {Array.from({ length: total }, (_, i) => (

          <div

            key={i}

            className={`min-w-0 flex-1 transition-[background-color,flex-basis] duration-150 motion-reduce:transition-none ${

              i < done ? 'bg-st-accent' : 'bg-st-bd2'

            }`}

            style={{ transitionDuration: '150ms' }}

          />

        ))}

      </div>

      <div

        className="flex h-0.5 w-full gap-px overflow-hidden opacity-60"

        aria-hidden

        title={`${moveDone} of ${moveTotal} lesson steps`}

      >

        {Array.from({ length: Math.min(moveTotal, 20) }, (_, i) => (

          <div

            key={i}

            className={`min-w-0 flex-1 ${i < moveDone ? 'bg-st-accent/70' : 'bg-st-faint'}`}

          />

        ))}

      </div>

    </div>

  );

}

