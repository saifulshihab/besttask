/** Centred message for a page-level empty, error or not-found state. */
export function PageMessage({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-7 py-12">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <h1 className="m-0 text-xl font-bold">{title}</h1>
        {body ? <p className="m-0 leading-normal text-muted">{body}</p> : null}
        {action}
      </div>
    </div>
  );
}
