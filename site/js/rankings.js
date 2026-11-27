/* Wanderlust Mission: hut rankings. This is the only file to edit when rating a hut.

   Scores run from 1 to `scale`. Leave a score as null until the hut is rated; it then shows as a dash.
   For a hut that was not staffed, set food to 'none' and it is left out of that hut's average.
   `note` is one optional line shown under the hut's name.
   To add or rename a category, change the `categories` list and give every hut a matching entry. */
window.WM_RANKINGS = {
  scale: 10,
  categories: [
    { id: 'architecture', label: 'Architecture', note: 'The building from outside' },
    { id: 'interior', label: 'Interior design', note: 'Common room, bunks, details' },
    { id: 'approach', label: 'Hike and approach', note: 'The way up to the hut' },
    { id: 'setting', label: 'Setting and view', note: 'Where it sits, what you see' },
    { id: 'food', label: 'Food', note: 'Only when the hut was staffed' }
  ],
  huts: {
    "Hundsteinhütte": { architecture: 4, interior: 4, approach: 8, setting: 8, food: 'none', note: '' },
    "Chamanna da Grialetsch": { architecture: 7, interior: 5, approach: 5, setting: 7.5, food: 'none', note: '' },
    "Glattalphütte": { architecture: 7, interior: 6, approach: 2, setting: 6, food: 6, note: '' },
    "Lidernenhütte": { architecture: 7.5, interior: 6, approach: 2, setting: 6, food: 6, note: '' },
    "Voralphütte": { architecture: 6, interior: 7, approach: 7, setting: 6.5, food: 'none', note: '' },
    "Spitzmeilenhütte": { architecture: 8, interior: 7, approach: 8, setting: 6, food: 'none', note: '' },
    "Leglerhütte": { architecture: 7, interior: 8, approach: 7.5, setting: 8.5, food: 8.5, note: '' },
    "Capanna Piansecco": { architecture: 8, interior: 10, approach: 4, setting: 4, food: 8, note: '' },
    "Salbithütte": { architecture: 5, interior: 4, approach: 4, setting: 6, food: 5, note: '' },
    "Sewenhütte": { architecture: 7, interior: 5, approach: 4, setting: 5, food: 8, note: '' },
    "Glärnischhütte": { architecture: 7, interior: 6, approach: 7.5, setting: 8, food: 8, note: '' },
    "Fridolinshütten": { architecture: 6, interior: 5, approach: 6, setting: 7, food: 7, note: '' },
    "Grünhornhütte": { architecture: 1, interior: 1, approach: 5, setting: 9, food: 'none', note: '' },
    "Planurahütte": { architecture: 9, interior: 8, approach: 8, setting: 10, food: 9, note: '' },
    "Rugghubelhütte": { architecture: 4, interior: 6, approach: 6, setting: 8, food: 8, note: '' },
    "Albert-Heim-Hütte": { architecture: 8, interior: 7, approach: 7, setting: 9, food: 7, note: '' },
    "Dammahütte": { architecture: 6, interior: 5, approach: 6.5, setting: 7.5, food: 7, note: '' },
    "Kröntenhütte": { architecture: 8, interior: 7.5, approach: 6, setting: 7, food: 'none', note: '' }
  }
};
