const retired=()=>Response.json({error:'Sentiment betting has been removed.'},{status:410,headers:{'Cache-Control':'no-store'}});
export const GET=retired;
export const POST=retired;
