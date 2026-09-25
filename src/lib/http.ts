export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]+/g, "_")}"`,
    },
  });
}
export function fileResponse(buf: Buffer, filename: string, mime: string) {
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": mime || "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` },
  });
}
