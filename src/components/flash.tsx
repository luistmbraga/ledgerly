type FlashProps = {
  error?: string;
  message?: string;
};

export function Flash({ error, message }: FlashProps) {
  return (
    <>
      {message ? (
        <p
          role="status"
          className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
