'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Library,
  Target,
} from 'lucide-react';
import { usePermissions } from '@/lib/permissions';
import { usePortalMe } from '@/lib/hooks';
import type { TeachingAssignment } from '@/lib/teaching';
import { PetrosLearningProposal } from './petros-learning-proposal';
import { PetrosTeacherGuidance } from './petros-teacher-guidance';
import { PetrosPhase6LessonAuthor } from './petros-phase6-lesson-author';
import styles from './petros-learn.module.css';
type Area = 'lessons' | 'goals' | 'progress' | 'reviews' | 'curriculum';
export function PetrosLearnWorkspace({
  assignment,
}: {
  assignment: TeachingAssignment;
}) {
  const [area, setArea] = useState<Area>('lessons'),
    [reviewAccess, setReviewAccess] = useState(false),
    [goalsVisited, setGoalsVisited] = useState(false);
  const lessonLocation = useRef('#petros-lessons-material');
  const permissions = usePermissions(),
    me = usePortalMe();
  const demo = Boolean(me.data?.institutionName?.includes('Isolated'));
  const canAuthor = permissions.canAny(
    'class_content.manage',
    'syllabus.manage',
  );
  useEffect(() => {
    const read = () => {
      const requested = window.location.hash.split('-')[1];
      if (
        ['lessons', 'goals', 'progress', 'reviews', 'curriculum'].includes(
          requested ?? '',
        )
      ) {
        setArea(requested as Area);
        if (requested === 'lessons')
          lessonLocation.current = window.location.hash;
        if (requested === 'goals' || requested === 'progress')
          setGoalsVisited(true);
      }
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const links = [
    { key: 'lessons', title: 'Lessons', icon: BookOpen },
    { key: 'goals', title: 'Learning goals', icon: Target },
    { key: 'progress', title: 'Student progress', icon: BarChart3 },
    ...(reviewAccess
      ? [{ key: 'reviews', title: 'Lesson reviews', icon: ClipboardCheck }]
      : []),
    ...(canAuthor
      ? [{ key: 'curriculum', title: 'Curriculum authoring', icon: Library }]
      : []),
  ];
  function choose(key: Area) {
    if (
      area === 'lessons' &&
      window.location.hash.startsWith('#petros-lessons-')
    )
      lessonLocation.current = window.location.hash;
    setArea(key);
    if (key === 'goals' || key === 'progress') setGoalsVisited(true);
    window.history.replaceState(
      null,
      '',
      key === 'lessons' ? lessonLocation.current : `#petros-${key}`,
    );
  }
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>
            <BookOpen size={24} aria-hidden="true" />
          </span>
          <div>
            <h2>Petros Learn</h2>
            <p>Prepare lessons and guide your students.</p>
          </div>
        </div>
      </header>
      <nav className={styles.nav} aria-label="Petros Learn areas">
        {links.map(({ key, title, icon: Icon }) => (
          <button
            key={key}
            aria-current={area === key ? 'page' : undefined}
            onClick={() => choose(key as Area)}
          >
            <Icon size={16} aria-hidden="true" />
            {title}
          </button>
        ))}
      </nav>
      <div hidden={area !== 'lessons' && area !== 'reviews'}>
        <PetrosLearningProposal
          assignment={assignment}
          mode={area === 'reviews' ? 'reviews' : 'lessons'}
          onReviewAccess={setReviewAccess}
        />
      </div>
      {goalsVisited && (
        <div hidden={area !== 'goals' && area !== 'progress'}>
          <PetrosTeacherGuidance
            assignment={assignment}
            mode={area === 'progress' ? 'progress' : 'goals'}
            demo={demo}
          />
        </div>
      )}
      {area === 'curriculum' &&
        (canAuthor ? (
          <PetrosPhase6LessonAuthor
            assignment={assignment}
            classId={assignment.classId}
            subjectId={assignment.subjectId}
          />
        ) : (
          <div className={styles.empty}>
            <h3>Curriculum authoring access required</h3>
            <p>
              Your role needs teaching content or syllabus management permission
              to use this workspace.
            </p>
          </div>
        ))}
    </div>
  );
}
