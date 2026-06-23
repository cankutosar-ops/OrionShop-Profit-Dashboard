type DataBannerProps = {
  isSampleData: boolean;
  message?: string;
};

export function DataBanner({ isSampleData, message }: DataBannerProps) {
  if (!isSampleData && !message) return null;

  return (
    <div
      className={
        isSampleData
          ? "mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
          : "mb-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
      }
    >
      {isSampleData ? (
        <>
          <span className="font-medium">Sample data</span>
          {message && <> — {message}</>}
        </>
      ) : (
        <>
          <span className="font-medium">Live data</span> — connected to Supabase
        </>
      )}
    </div>
  );
}
