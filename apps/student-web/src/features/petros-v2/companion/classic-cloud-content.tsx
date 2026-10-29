/** Keep approved explanation text intact while separating its paragraphs and
 * short, source-authored topic labels. No generated summary or HTML parsing. */
export function ClassicCloudContent({ text }: { text: string }) {
  return text
    .trim()
    .split(/\r?\n(?:[\t ]*\r?\n)+/)
    .filter(Boolean)
    .map((paragraph, index) => {
      const topic = /^([A-Z][^.!?\n:\r]{1,64}:)[\t ]+([\s\S]+)$/.exec(paragraph);
      return (
        <section key={index}>
          {topic ? (
            <>
              <h3>{topic[1]}</h3> <p>{topic[2]}</p>
            </>
          ) : (
            <p>{paragraph}</p>
          )}
        </section>
      );
    });
}
