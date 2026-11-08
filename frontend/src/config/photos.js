const asset = (filename) => `${import.meta.env.BASE_URL}images/${filename}`;

export const avatar = asset('userphoto.jpg');
export const photoCategories = Object.freeze([
  { id: 'first', title: '第一次合照' }, { id: 'daily', title: '比心报备' }, { id: 'meals', title: '一起吃过的饭' },
]);
export const photos = [
  ['firstphoto.jpg', '第一次合照', 'first', '第一次合照的专属旋律：《迷人的危险》。', 'danger'],
  ['other1.jpg', '一起好好吃饭', 'meals', '餐桌上的小片段。'],
  ['other2.jpg', '分享喜欢的味道', 'meals', '把好吃的也收藏起来。'],
  ['other3.jpg', '热气腾腾的一餐', 'meals', '一份关于美食的记录。'],
  ['other4.jpg', '可爱的你', 'daily', '戴着面具的可爱模样。'],
  ['pther5.jpg', '吃饭也要比个心', 'meals', '碗筷前的一颗小爱心。'],
  ['other6.jpg', '学习时的小爱心', 'daily', '书页前的比心。'],
  ['other7.jpg', '给你一颗小爱心', 'daily', '电脑前的比心。'],
  ['other8.jpg', '课堂上的小爱心', 'daily', '课堂里的比心。'],
  ['other9.jpg', '收藏一点小快乐', 'daily', '手心里的小挂件。'],
].map(([filename, title, category, description, musicEgg], index) => ({
  id: index + 1, filename, src: asset(filename), title,
  category, description, musicEgg,
}));
