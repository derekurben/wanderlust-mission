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
    "Hundsteinhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Chamanna da Grialetsch": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Glattalphütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Lidernenhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Voralphütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Spitzmeilenhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Leglerhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Capanna Piansecco": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Salbithütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Sewenhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Glärnischhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Fridolinshütten": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Grünhornhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Planurahütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Rugghubelhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Albert-Heim-Hütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Dammahütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' },
    "Kröntenhütte": { architecture: null, interior: null, approach: null, setting: null, food: null, note: '' }
  }
};
