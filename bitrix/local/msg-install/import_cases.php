<?php
/**
 * Загружает в инфоблок 40 кейсов из файла cases.json (без фото и ссылок).
 * Сначала запустите setup_properties.php. Запуск — в «Командной PHP-строке»:
 *
 *   define('MSG_IBLOCK_ID', 12);
 *   require $_SERVER['DOCUMENT_ROOT'] . '/local/msg-install/import_cases.php';
 *
 * По умолчанию элементы создаются НЕАКТИВНЫМИ — проверьте и включите нужные.
 * Чтобы сразу включить: define('MSG_IMPORT_ACTIVE', true);  (перед require)
 * Элементы с уже существующим названием пропускаются, повторный запуск безопасен.
 */
if (!defined('MSG_IBLOCK_ID')) die('Не задан MSG_IBLOCK_ID');
\Bitrix\Main\Loader::includeModule('iblock');

$iblockId = (int)MSG_IBLOCK_ID;
$active = defined('MSG_IMPORT_ACTIVE') && MSG_IMPORT_ACTIVE ? 'Y' : 'N';
$cases = json_decode(file_get_contents(__DIR__ . '/cases.json'), true);
if (!$cases) die('Не удалось прочитать cases.json');

// значения списков: название => ID
$enums = [];
$re = CIBlockPropertyEnum::GetList([], ['IBLOCK_ID' => $iblockId]);
while ($e = $re->Fetch()) $enums[$e['PROPERTY_CODE']][$e['VALUE']] = $e['ID'];

$productIds = function ($text) use ($enums) {
    $t = mb_strtolower($text);
    $ids = [];
    $map = ['сварн' => 'Сварной настил', 'прессован' => 'Прессованный настил', 'решет' => 'Решётчатый настил', 'решёт' => 'Решётчатый настил'];
    foreach ($map as $needle => $name) {
        if (mb_strpos($t, $needle) !== false && isset($enums['PRODUCT'][$name])) $ids[$enums['PRODUCT'][$name]] = $enums['PRODUCT'][$name];
    }
    return array_values($ids);
};

$el = new CIBlockElement();
$added = 0; $skipped = 0;
foreach ($cases as $c) {
    if (CIBlockElement::GetList([], ['IBLOCK_ID' => $iblockId, '=NAME' => $c['title']], false, ['nTopCount' => 1], ['ID'])->Fetch()) { $skipped++; continue; }
    $fields = [
        'IBLOCK_ID' => $iblockId,
        'NAME' => $c['title'],
        'CODE' => CUtil::translit($c['title'], 'ru', ['max_len' => 80, 'replace_space' => '-', 'replace_other' => '-', 'delete_repeat_replace' => true]),
        'SORT' => (int)$c['sort'],
        'ACTIVE' => $active,
        'PROPERTY_VALUES' => [
            'MAP' => $c['lat'] . ',' . $c['lon'],
            'CITY' => $c['city'],
            'REGION' => $c['region'] ?? '',
            'COUNTRY' => $c['country'],
            'PRODUCT' => $productIds($c['product'] ?? ''),
            'INDUSTRY' => $enums['INDUSTRY'][$c['industry'] ?? ''] ?? false,
            'TASK' => $c['description'] ?? '',
            'SOLUTION' => $c['solution'] ?? '',
        ],
    ];
    if ($el->Add($fields)) $added++; else echo 'ОШИБКА «' . htmlspecialcharsbx($c['title']) . '»: ' . $el->LAST_ERROR . '<br>';
}
echo "Добавлено: $added, пропущено (уже есть): $skipped.";
