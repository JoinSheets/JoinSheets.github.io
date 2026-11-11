'use strict';

// The locale registry + string dictionaries + the t()/setLocale() pair the rest of
// the UI reads through. Unlike theme.js (which swaps a <link> href and leaves the DOM
// alone otherwise), a locale change needs every text node rebuilt -- there is no
// "apply once" step here; main.js calls setLocale() unconditionally at the top of
// every render(), before the view layer builds anything, and the normal render cycle
// takes care of the rest.
//
// Enum label arrays that live in the "pure" modules (dataset.js::OPERATORS/
// JOIN_TYPES, entities.js::ENTITY_TYPES/ENTITY_KINDS/AGG_FUNC_LABELS) keep their own
// English id+label pairs untouched -- those modules stay i18n-unaware, covered by
// node:test with no knowledge of state.lang. The view layer maps each id through a
// key here (operator.<id>, joinType.<id>, ...) instead of using the array's own
// label -- see view-build.js/view-entities.js/view-table.js.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory());
  }
})(typeof window !== 'undefined' ? window : this, function () {

  // "en" first -- the default (index.html's initial lang="en", store.js's initial
  // state, and findLocale's own fallback below all agree: LOCALES[0] is the
  // default). Also listed first in the settings panel, for the same reason.
  var LOCALES = [
    { id: 'en', name: 'English' },
    { id: 'ru', name: 'Русский' }
  ];

  // Both dictionaries ship in every build and load unconditionally (unlike
  // themes/*.css, nothing here is fetched on demand) -- file:// blocks fetch(), and
  // two flat string tables are small enough that there is no real cost to always
  // having both in memory. Keys are namespaced by screen/area, not the English text
  // itself, so a wording tweak on one side can never silently desync the two
  // languages or break a lookup.
  var STRINGS = {
    en: {
      'app.initializing': 'Initializing…',
      'app.openingDefaultPreset': 'Opening the table with the default preset…',

      'footer.path': 'Path: ',
      'footer.pathNotFound': 'Path: not found (neither data nor sample-data)',
      'footer.preset': 'Preset: ',
      'footer.sources': 'Sources: ',
      'footer.asOf': 'As of: ',
      'footer.asOfNow': 'now',
      'footer.rows': 'Rows: ',
      'footer.rowsOf': ' of ',
      'footer.columns': 'Columns: ',

      'error.noSourceSelected': 'No source selected',
      'error.noDataDirectory': 'No data directory (data/ or sample-data/)',
      'error.failedToLoadSources': 'Failed to load sources: {names}',
      'error.noFieldSelected': 'No field selected to display',
      'error.restartedAfterCrash': 'The previous attempt to build the table in this '
        + 'tab did not finish -- it looks like the browser ran out of memory for the '
        + 'selected preset and the tab restarted. To avoid a restart loop, an empty '
        + 'preset was applied. The saved preset is untouched -- you can open it '
        + 'manually on the Data screen (e.g. to narrow the selected sources/fields '
        + 'before trying again).',
      'error.manifestConflict': 'Source(s) with this name already exist in another '
        + 'manifest file: {names} -- rename the source, or make sure it is not '
        + 'described in two files at once.',
      'error.presetReadFailed': 'Could not read the preset: {name}',

      'formulaError.emptyFormula': 'empty formula',
      'formulaError.unterminatedString': 'unterminated string',
      'formulaError.unterminatedBracket': 'unterminated "[" bracket',
      'formulaError.unexpectedCharacter': 'unexpected character {char}',
      'formulaError.unexpectedEnd': 'unexpected end of formula',
      'formulaError.expectedOp': 'expected "{op}"',
      'formulaError.ifArgCount': 'IF expects exactly 3 arguments: condition, "then", "else"',
      'formulaError.unknownFunction': 'unknown function: {name}',
      'formulaError.unknownVariable': 'unknown variable: {name}',
      'formulaError.unexpectedToken': 'unexpected token',
      'formulaError.trailingCharacters': 'trailing characters after the end of the expression',
      'formulaError.atPosition': ' (position {pos})',

      'common.dash': '—',
      'common.fieldPlaceholder': 'field…',
      'common.valuePlaceholder': 'value',
      'common.up': 'up',
      'common.down': 'down',
      'common.addCondition': '+ condition',
      'common.applyAndOpenTable': 'Apply and open table',
      'common.building': 'Building…',
      'common.pasteFromClipboard': 'Paste from clipboard',
      'common.valueListPlaceholder': 'values: one per line or comma-separated',
      'common.valueCountSuffix': ' value(s)',

      'settings.theme.title': 'Theme',
      'settings.language.title': 'Language',
      'settings.about.title': 'About',
      'settings.about.link': 'Documentation & site',
      'settings.apply': 'Apply',

      'nav.export': 'Export',
      'nav.filter': 'Filter',
      'nav.filterTitle': 'Advanced filter and sort: temporary, applied on top of the selection, not saved',
      'nav.fields': 'Fields',
      'nav.fieldsTitle': 'Fields: which columns to show and how to compute them',
      'nav.data': 'Data',
      'nav.dataTitle': 'Data: sources, joins, conditions',
      'nav.toFields': '← To Fields',
      'nav.toTable': 'To Table →',
      'nav.toTableBack': '← To Table',
      'nav.toData': 'To Data →',
      'nav.orgLogoTitle': 'JoinSheets documentation & site',
      'nav.settingsTitle': 'Settings',

      'build.pageTitle': 'Data',
      'build.dataDirLabel': 'Data directory (relative to index.html)',
      'build.refreshManifest': 'Refresh manifest',
      'build.refreshManifestTitle': 'Re-read manifest.js (+ manifest.imports.js, if '
        + 'present) at the given path -- pick up new sources without reloading the '
        + 'page, or switch to a different directory',
      'build.importFromExcel': 'Import from Excel',
      'build.sourcesAndFields': 'Sources and fields',
      'build.manifestEmpty': 'The manifest is empty -- generate or publish data for this directory.',
      'build.joinsBetweenSources': 'Joins between sources',
      'build.joinsHint': 'each following source joins onto the set accumulated so far '
        + '(as in SQL) -- the left side can be any previously included source; the '
        + 'join type determines which unmatched rows remain: left keeps all rows of '
        + 'the left source, right keeps all rows of the right source, inner keeps '
        + 'only matches, full keeps all',
      'build.conditionsTitle': 'Conditions (narrow the selection when building)',
      'build.conditionsHint': 'applied in order (AND) when building, right after the '
        + 'joins -- before fields are computed; filtering by field is on the Fields screen',
      'build.presetNameLabel': 'Preset name',
      'build.presetAutoSaveNote': 'changes save automatically as this tab\'s default '
        + 'preset (sessionStorage); "Download preset" is a separate file',
      'build.downloadPreset': 'Download preset',
      'build.loadPreset': 'Load preset',
      'build.resetToBase': 'Reset to base',
      'build.promptFileName': 'Preset file name:',
      'build.promptDescription': 'Preset description (shown as the title on the Table screen):',
      'build.sourceFoldCheckFirst': 'check the source first',
      'build.sourceFoldCollapse': 'collapse fields',
      'build.sourceFoldExpand': 'expand fields',
      'build.rowsAsOf': ' rows · as of ',
      'build.fieldsCountPrefix': '· fields: ',
      'build.fieldsCountOf': ' of ',
      'build.keyTag': 'key',
      'build.freshBadge': 'fresh',
      'build.staleBadge': 'rebuild',
      'build.staleTooltip': 'db_max_cnt {dbMax} > gen_max_cnt {genMax}',

      'joinType.left': 'LEFT',
      'joinType.right': 'RIGHT',
      'joinType.inner': 'INNER',
      'joinType.full': 'FULL',
      'joinType.selectTitle': 'join type',

      'operator.contains': 'contains',
      'operator.not_contains': 'does not contain',
      'operator.eq': 'equals',
      'operator.ne': 'not equals',
      'operator.in': 'in list',
      'operator.not_in': 'not in list',
      'operator.starts': 'starts with',
      'operator.ends': 'ends with',
      'operator.gt': '> (number)',
      'operator.gte': '≥ (number)',
      'operator.lt': '< (number)',
      'operator.lte': '≤ (number)',
      'operator.empty': 'empty',
      'operator.not_empty': 'not empty',

      'entities.pageTitle': 'Fields',
      'entities.nameLabel': 'Name',
      'entities.hideInTable': 'hide in table',
      'entities.hideInTableTitle': 'computed and available to the conditions below, but not shown in the table/export',
      'entities.calculationMethod': 'Calculation method',
      'entities.dataType': 'Data type',
      'entities.calculationSource': 'Calculation source',
      'entities.moveUp': 'move up',
      'entities.moveDown': 'move down',
      'entities.removeField': 'remove field',
      'entities.weightPlaceholder': 'weight',
      'entities.addInput': '+ input',
      'entities.nullWins': 'null (DELETE) from the higher-weight source wins',
      'entities.weightTieHint': 'ties in weight resolve top-to-bottom',
      'entities.formulaLabel': 'Formula',
      'entities.formulaPlaceholderEmpty': 'add input(s) first',
      'entities.formulaHint': 'letters A, B, ... follow the input order above; '
        + 'functions: {functions}; a direct reference to a raw field -- [Source.Field]',
      'entities.dateInputFormatLabel': 'input format',
      'entities.dateInputFormatPlaceholder': 'auto | excel | DD.MM.YYYY',
      'entities.dateOutputFormatLabel': 'output format',
      'entities.dateFormatHint': '"auto" understands ISO, DD.MM.YYYY, unix time, and '
        + 'an Excel serial date (5-7 digits); "excel" means only a serial date; '
        + 'otherwise tokens YYYY MM DD HH mm ss with any separators',
      'entities.trueTokensLabel': 'true tokens (comma-separated)',
      'entities.decimalSeparatorLabel': 'decimal separator',
      'entities.columnNamePlaceholder': 'column name',
      'entities.addSourceFieldTitle': 'add "{column}" as-is',
      'entities.conditionsTitle': 'Conditions on fields',
      'entities.conditionsHint': 'the second pass, after fields are computed (the '
        + 'first is on Data, on raw fields): applied in order (AND), narrows what '
        + 'reaches Table -- regardless of whether the field itself is hidden',
      'entities.noFieldsYet': 'no fields yet -- the table will show the selected fields as-is',
      'entities.sourceFieldsAsIs': 'Source fields (as-is)',
      'entities.addField': '+ field',
      'entities.fieldsHint': 'a field is one column: a renamed/typed field, '
        + 'weight-based collision resolution, or a formula. Row order = column '
        + 'order. Type drives parsing (dates/numbers); unparseable values are '
        + 'highlighted. "Hide in table" means it\'s computed and available to the '
        + 'conditions below, but not shown in the result.',
      'entities.chooseSourcesFirst': 'First choose sources and fields on the Data screen.',

      'entityType.text': 'text',
      'entityType.number': 'number',
      'entityType.date': 'date',
      'entityType.bool': 'boolean',

      'entityKind.field': 'field',
      'entityKind.resolve': 'coalesce',
      'entityKind.formula': 'formula',

      'numberDecimal.auto': 'auto',
      'numberDecimal.period': 'period',
      'numberDecimal.comma': 'comma',

      'agg.SUM': 'sum',
      'agg.AVG': 'average',
      'agg.MIN': 'min',
      'agg.MAX': 'max',
      'agg.COUNT_NONEMPTY': 'count',

      'table.cellDeletedTitle': 'deleted (DELETE)',
      'table.cellUnparsedTitle': 'not recognized as "{type}"',
      'table.setFilter': 'Set filter',
      'table.groupBy': 'Group By',
      'table.orderBy': 'Order By',
      'table.addGroupingLevel': '+ grouping level',
      'table.addSortingLevel': '+ sorting level',
      'table.noFreeAggFields': 'no free number/date/boolean fields left to aggregate',
      'table.addAggregate': '+ aggregate in summary',
      'table.ascending': 'ascending',
      'table.descending': 'descending',
      'table.hideEmptyColumns': 'hide empty columns',
      'table.showAll': 'Show all',
      'table.conjAnd': 'AND',
      'table.conjOr': 'OR',
      'table.exportExcel': 'Excel',
      'table.exportCsv': 'CSV',
      'table.export': 'Export',
      'table.searchColumnTitle': 'Search this column',
      'table.quickFilterTitle': 'Quick filter (contains)',
      'table.sortIconTitle': 'Sort: ascending / descending / none',
      'table.colResizerTitle': 'Drag -- column width; double-click -- reset',
      'table.searchPlaceholder': 'search…',
      'table.filterPlaceholder': 'filter…',
      'table.searchInputTitle': 'Text + Enter -- jump to the next row below and close; Esc -- close without searching',
      'table.filterInputTitle': 'Text + Enter (or the button on the right) -- apply and close; Esc -- cancel the input and close',
      'table.findNext': 'Find next',
      'table.applyFilter': 'Apply filter',
      'table.quickShowLabel': 'Show ',
      'table.expandAll': 'expand all',
      'table.collapseAll': 'collapse all',
      'table.buildFirst': 'First build the table on the Data screen.'
    },
    ru: {
      'app.initializing': 'Инициализация…',
      'app.openingDefaultPreset': 'Открываем таблицу с пресетом по умолчанию…',

      'footer.path': 'Путь: ',
      'footer.pathNotFound': 'Путь: не найден (нет ни data, ни sample-data)',
      'footer.preset': 'Пресет: ',
      'footer.sources': 'Источники: ',
      'footer.asOf': 'На момент: ',
      'footer.asOfNow': 'сейчас',
      'footer.rows': 'Строк: ',
      'footer.rowsOf': ' из ',
      'footer.columns': 'Столбцов: ',

      'error.noSourceSelected': 'Не выбран ни один источник',
      'error.noDataDirectory': 'Нет директории с данными (data/ или sample-data/)',
      'error.failedToLoadSources': 'Не удалось загрузить источники: {names}',
      'error.noFieldSelected': 'Не выбрано ни одно поле для отображения',
      'error.restartedAfterCrash': 'Предыдущая попытка построить таблицу в этой '
        + 'вкладке не завершилась -- похоже, браузеру не хватило памяти для '
        + 'выбранного пресета, и вкладка перезапустилась. Чтобы не уйти в цикл '
        + 'перезапусков, был применён пустой пресет. Сохранённый пресет не '
        + 'тронут -- его можно открыть вручную на экране «Данные» (например, '
        + 'чтобы сузить выбранные источники/поля перед повторной попыткой).',
      'error.manifestConflict': 'Источник(и) с таким именем уже есть в другом файле '
        + 'манифеста: {names} -- переименуйте источник или убедитесь, что он не '
        + 'описан в двух файлах одновременно.',
      'error.presetReadFailed': 'Не удалось прочитать пресет: {name}',

      'formulaError.emptyFormula': 'пустая формула',
      'formulaError.unterminatedString': 'незакрытая строка',
      'formulaError.unterminatedBracket': 'незакрытая скобка "["',
      'formulaError.unexpectedCharacter': 'неожиданный символ {char}',
      'formulaError.unexpectedEnd': 'неожиданный конец формулы',
      'formulaError.expectedOp': 'ожидалось "{op}"',
      'formulaError.ifArgCount': 'IF требует ровно 3 аргумента: условие, "тогда", "иначе"',
      'formulaError.unknownFunction': 'неизвестная функция: {name}',
      'formulaError.unknownVariable': 'неизвестная переменная: {name}',
      'formulaError.unexpectedToken': 'неожиданный токен',
      'formulaError.trailingCharacters': 'лишние символы после конца выражения',
      'formulaError.atPosition': ' (позиция {pos})',

      'common.dash': '—',
      'common.fieldPlaceholder': 'поле…',
      'common.valuePlaceholder': 'значение',
      'common.up': 'вверх',
      'common.down': 'вниз',
      'common.addCondition': '+ условие',
      'common.applyAndOpenTable': 'Применить и открыть таблицу',
      'common.building': 'Строим…',
      'common.pasteFromClipboard': 'Вставить из буфера обмена',
      'common.valueListPlaceholder': 'значения: по одному на строке или через запятую',
      'common.valueCountSuffix': ' знач.',

      'settings.theme.title': 'Тема',
      'settings.language.title': 'Язык',
      'settings.about.title': 'О приложении',
      'settings.about.link': 'Документация и сайт',
      'settings.apply': 'Применить',

      'nav.export': 'Экспорт',
      'nav.filter': 'Фильтр',
      'nav.filterTitle': 'Расширенный фильтр и сортировка: временные, применяются поверх выборки, не сохраняются',
      'nav.fields': 'Поля',
      'nav.fieldsTitle': 'Поля: какие столбцы показывать и как их считать',
      'nav.data': 'Данные',
      'nav.dataTitle': 'Данные: источники, связки, условия',
      'nav.toFields': '← К полям',
      'nav.toTable': 'К таблице →',
      'nav.toTableBack': '← К таблице',
      'nav.toData': 'К данным →',
      'nav.orgLogoTitle': 'Документация и сайт JoinSheets',
      'nav.settingsTitle': 'Настройки',

      'build.pageTitle': 'Данные',
      'build.dataDirLabel': 'Директория с данными (относительно index.html)',
      'build.refreshManifest': 'Обновить манифест',
      'build.refreshManifestTitle': 'Перечитать manifest.js (+ manifest.imports.js, '
        + 'если есть) по указанному пути -- подхватить новые источники без '
        + 'перезагрузки страницы, или переключиться на другую директорию',
      'build.importFromExcel': 'Импорт из Excel',
      'build.sourcesAndFields': 'Источники и поля',
      'build.manifestEmpty': 'Манифест пуст -- сгенерируйте или опубликуйте данные для этой директории.',
      'build.joinsBetweenSources': 'Связки между источниками',
      'build.joinsHint': 'каждый следующий источник связывается с уже накопленным '
        + 'набором (как в SQL) -- левой стороной может быть любой ранее '
        + 'включённый источник; тип связки определяет, какие несовпавшие строки '
        + 'остаются: left оставляет все строки левого источника, right -- все '
        + 'строки правого, inner оставляет только совпадения, full -- все строки',
      'build.conditionsTitle': 'Условия (сужают выборку при построении)',
      'build.conditionsHint': 'применяются по порядку (И) при построении, сразу '
        + 'после связок -- ещё до вычисления полей; фильтрация по полю -- на экране «Поля»',
      'build.presetNameLabel': 'Имя пресета',
      'build.presetAutoSaveNote': 'изменения сохраняются автоматически как пресет '
        + 'этой вкладки по умолчанию (sessionStorage); «Скачать пресет» -- это отдельный файл',
      'build.downloadPreset': 'Скачать пресет',
      'build.loadPreset': 'Загрузить пресет',
      'build.resetToBase': 'Сбросить к базовому',
      'build.promptFileName': 'Имя файла пресета:',
      'build.promptDescription': 'Описание пресета (показывается как заголовок на экране «Таблица»):',
      'build.sourceFoldCheckFirst': 'сначала отметьте источник',
      'build.sourceFoldCollapse': 'свернуть поля',
      'build.sourceFoldExpand': 'развернуть поля',
      'build.rowsAsOf': ' строк · на момент ',
      'build.fieldsCountPrefix': '· полей: ',
      'build.fieldsCountOf': ' из ',
      'build.keyTag': 'ключ',
      'build.freshBadge': 'свежий',
      'build.staleBadge': 'пересобрать',
      'build.staleTooltip': 'db_max_cnt {dbMax} > gen_max_cnt {genMax}',

      'joinType.left': 'ЛЕВОЕ',
      'joinType.right': 'ПРАВОЕ',
      'joinType.inner': 'ВНУТРЕННЕЕ',
      'joinType.full': 'ПОЛНОЕ',
      'joinType.selectTitle': 'тип связки',

      'operator.contains': 'содержит',
      'operator.not_contains': 'не содержит',
      'operator.eq': 'равно',
      'operator.ne': 'не равно',
      'operator.in': 'в списке',
      'operator.not_in': 'не в списке',
      'operator.starts': 'начинается с',
      'operator.ends': 'заканчивается на',
      'operator.gt': '> (число)',
      'operator.gte': '≥ (число)',
      'operator.lt': '< (число)',
      'operator.lte': '≤ (число)',
      'operator.empty': 'пусто',
      'operator.not_empty': 'не пусто',

      'entities.pageTitle': 'Поля',
      'entities.nameLabel': 'Имя',
      'entities.hideInTable': 'скрыть в таблице',
      'entities.hideInTableTitle': 'вычисляется и доступно условиям ниже, но не показывается в таблице/экспорте',
      'entities.calculationMethod': 'Способ вычисления',
      'entities.dataType': 'Тип данных',
      'entities.calculationSource': 'Источник вычисления',
      'entities.moveUp': 'переместить выше',
      'entities.moveDown': 'переместить ниже',
      'entities.removeField': 'удалить поле',
      'entities.weightPlaceholder': 'вес',
      'entities.addInput': '+ вход',
      'entities.nullWins': 'null (DELETE) из источника с большим весом побеждает',
      'entities.weightTieHint': 'при равенстве веса -- по порядку сверху вниз',
      'entities.formulaLabel': 'Формула',
      'entities.formulaPlaceholderEmpty': 'сначала добавьте вход(ы)',
      'entities.formulaHint': 'буквы A, B, ... соответствуют порядку входов выше; '
        + 'функции: {functions}; прямая ссылка на исходное поле -- [Источник.Поле]',
      'entities.dateInputFormatLabel': 'формат на входе',
      'entities.dateInputFormatPlaceholder': 'auto | excel | DD.MM.YYYY',
      'entities.dateOutputFormatLabel': 'формат на выходе',
      'entities.dateFormatHint': '"auto" понимает ISO, DD.MM.YYYY, unix time и '
        + 'числовую дату Excel (5-7 цифр); "excel" -- только числовую дату Excel; '
        + 'иначе -- токены YYYY MM DD HH mm ss с любыми разделителями',
      'entities.trueTokensLabel': 'токены "истина" (через запятую)',
      'entities.decimalSeparatorLabel': 'десятичный разделитель',
      'entities.columnNamePlaceholder': 'имя столбца',
      'entities.addSourceFieldTitle': 'добавить «{column}» как есть',
      'entities.conditionsTitle': 'Условия по полям',
      'entities.conditionsHint': 'второй проход, уже после вычисления полей (первый '
        + '-- на «Данных», по исходным полям): применяются по порядку (И), сужают '
        + 'то, что попадает в «Таблицу» -- независимо от того, скрыто ли само поле',
      'entities.noFieldsYet': 'полей пока нет -- таблица покажет выбранные поля как есть',
      'entities.sourceFieldsAsIs': 'Исходные поля (как есть)',
      'entities.addField': '+ поле',
      'entities.fieldsHint': 'поле -- это один столбец: переименованное/типизированное '
        + 'поле, разрешение коллизий по весу, либо формула. Порядок строк = '
        + 'порядок столбцов. Тип определяет разбор (даты/числа); нераспознанные '
        + 'значения подсвечиваются. «Скрыть в таблице» значит, что поле вычисляется '
        + 'и доступно условиям ниже, но не показывается в результате.',
      'entities.chooseSourcesFirst': 'Сначала выберите источники и поля на экране «Данные».',

      'entityType.text': 'текст',
      'entityType.number': 'число',
      'entityType.date': 'дата',
      'entityType.bool': 'булево',

      'entityKind.field': 'поле',
      'entityKind.resolve': 'слияние',
      'entityKind.formula': 'формула',

      'numberDecimal.auto': 'авто',
      'numberDecimal.period': 'точка',
      'numberDecimal.comma': 'запятая',

      'agg.SUM': 'сумма',
      'agg.AVG': 'среднее',
      'agg.MIN': 'мин',
      'agg.MAX': 'макс',
      'agg.COUNT_NONEMPTY': 'количество',

      'table.cellDeletedTitle': 'удалено (DELETE)',
      'table.cellUnparsedTitle': 'не распознано как "{type}"',
      'table.setFilter': 'Условия фильтра',
      'table.groupBy': 'Группировка',
      'table.orderBy': 'Сортировка',
      'table.addGroupingLevel': '+ уровень группировки',
      'table.addSortingLevel': '+ уровень сортировки',
      'table.noFreeAggFields': 'не осталось свободных числовых/датных/булевых полей для агрегации',
      'table.addAggregate': '+ агрегат в итоговой строке',
      'table.ascending': 'по возрастанию',
      'table.descending': 'по убыванию',
      'table.hideEmptyColumns': 'скрывать пустые столбцы',
      'table.showAll': 'Показать всё',
      'table.conjAnd': 'И',
      'table.conjOr': 'ИЛИ',
      'table.exportExcel': 'Excel',
      'table.exportCsv': 'CSV',
      'table.export': 'Экспорт',
      'table.searchColumnTitle': 'Поиск по этому столбцу',
      'table.quickFilterTitle': 'Быстрый фильтр (содержит)',
      'table.sortIconTitle': 'Сортировка: по возрастанию / по убыванию / без сортировки',
      'table.colResizerTitle': 'Перетащите -- ширина столбца; двойной клик -- сбросить',
      'table.searchPlaceholder': 'поиск…',
      'table.filterPlaceholder': 'фильтр…',
      'table.searchInputTitle': 'Текст + Enter -- перейти к следующей строке ниже и закрыть; Esc -- закрыть без поиска',
      'table.filterInputTitle': 'Текст + Enter (или кнопка справа) -- применить и закрыть; Esc -- отменить ввод и закрыть',
      'table.findNext': 'Найти следующее',
      'table.applyFilter': 'Применить фильтр',
      'table.quickShowLabel': 'Показывать ',
      'table.expandAll': 'развернуть всё',
      'table.collapseAll': 'свернуть всё',
      'table.buildFirst': 'Сначала постройте таблицу на экране «Данные».'
    }
  };

  var currentLocale = 'en';

  var findLocale = function (id) {
    return LOCALES.find(function (l) { return l.id === id; }) || LOCALES[0];
  };

  // Called unconditionally at the top of every render() -- there is no DOM to touch
  // here (that's the view layer's job, right after), just which dictionary t() reads
  // from for the render pass about to happen. Falls back to LOCALES[0] ("en") for an
  // id that doesn't match anything (e.g. a stale localStorage value from before a
  // locale was renamed/removed) -- same fallback shape as theme.js::applyTheme.
  var setLocale = function (id) {
    currentLocale = findLocale(id).id;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLocale;
    }
  };

  // Missing key -> the key itself (visible in the UI, not a crash) -- same "fail
  // loud, don't fail hard" choice as theme.js's unknown-id fallback. Missing
  // translation for a key that DOES exist in "en" -> fall back to "en" rather than
  // the raw key, so a not-yet-translated string still reads as real text.
  // params (optional): {name} placeholders inside the resolved string are replaced
  // with String(params[name]) -- used by the handful of keys that carry dynamic
  // data (an error's source names, a formula error's offending token, ...).
  var t = function (key, params) {
    var dict = STRINGS[currentLocale] || STRINGS.en;
    var s = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key]
      : Object.prototype.hasOwnProperty.call(STRINGS.en, key) ? STRINGS.en[key]
      : key;
    if (!params) return s;
    return Object.keys(params).reduce(function (acc, k) {
      return acc.split('{' + k + '}').join(String(params[k]));
    }, s);
  };

  return { LOCALES: LOCALES, findLocale: findLocale, setLocale: setLocale, t: t };
});
