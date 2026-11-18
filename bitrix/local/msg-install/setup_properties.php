<?php
/**
 * Создаёт свойства инфоблока для карты объектов.
 * Запуск: Администрирование → Настройки → Инструменты → Командная PHP-строка:
 *
 *   define('MSG_IBLOCK_ID', 12);   // ← ID вашего инфоблока
 *   require $_SERVER['DOCUMENT_ROOT'] . '/local/msg-install/setup_properties.php';
 *
 * Если «Привязка к Яндекс.Карте» у вас не настроена (нет ключа), добавьте строку
 *   define('MSG_COORDS_AS_TEXT', true);
 * тогда координаты вводятся текстом «широта,долгота» (например 55.75,37.62).
 * Уже существующие свойства не трогаются — скрипт безопасно запускать повторно.
 */
if (!defined('MSG_IBLOCK_ID')) die('Не задан MSG_IBLOCK_ID');
\Bitrix\Main\Loader::includeModule('iblock');

$iblockId = (int)MSG_IBLOCK_ID;
$asText = defined('MSG_COORDS_AS_TEXT') && MSG_COORDS_AS_TEXT;

$mk = function ($code, $name, $sort, $extra = []) use ($iblockId) {
    return array_merge([
        'IBLOCK_ID' => $iblockId, 'CODE' => $code, 'NAME' => $name, 'SORT' => $sort,
        'ACTIVE' => 'Y', 'PROPERTY_TYPE' => 'S', 'MULTIPLE' => 'N',
    ], $extra);
};
$enum = function ($list) {
    $r = []; $i = 10;
    foreach ($list as $v) { $r[] = ['VALUE' => $v, 'DEF' => 'N', 'SORT' => $i]; $i += 10; }
    return $r;
};

$props = [
    $mk('MAP', 'Точка на карте', 10, $asText ? ['HINT' => 'Широта,долгота, например 55.75,37.62'] : ['USER_TYPE' => 'map_yandex']),
    $mk('CITY', 'Город / место', 20),
    $mk('REGION', 'Регион (необязательно)', 30),
    $mk('COUNTRY', 'Страна', 40, ['HINT' => 'Если пусто — будет «Россия»']),
    $mk('PRODUCT', 'Вид настила', 50, [
        'PROPERTY_TYPE' => 'L', 'LIST_TYPE' => 'C', 'MULTIPLE' => 'Y',
        'VALUES' => $enum(['Сварной настил', 'Прессованный настил', 'Решётчатый настил']),
    ]),
    $mk('INDUSTRY', 'Отрасль', 60, [
        'PROPERTY_TYPE' => 'L', 'LIST_TYPE' => 'L',
        'VALUES' => $enum([
            'Нефть и газ', 'Нефтехимия и химия', 'Энергетика', 'Металлургия, горнодобыча, стройматериалы',
            'Пищевая промышленность и агро', 'ЦОД и электроника', 'Промышленность и транспорт',
            'Строительство и благоустройство', 'Экология',
        ]),
    ]),
    $mk('TASK', 'Задача', 70, ['ROW_COUNT' => 4, 'COL_COUNT' => 60]),
    $mk('SOLUTION', 'Решение', 80, ['ROW_COUNT' => 4, 'COL_COUNT' => 60]),
    $mk('PERIOD', 'Год / период (необязательно)', 90),
];

$ibp = new CIBlockProperty();
foreach ($props as $f) {
    $exists = CIBlockProperty::GetList([], ['IBLOCK_ID' => $iblockId, 'CODE' => $f['CODE']])->Fetch();
    if ($exists) { echo "Уже есть: {$f['CODE']}<br>"; continue; }
    $id = $ibp->Add($f);
    echo $id ? "Создано: {$f['CODE']} (ID $id)<br>" : "ОШИБКА {$f['CODE']}: " . $ibp->LAST_ERROR . '<br>';
}
echo '<br>Готово. Теперь можно добавлять объекты в инфоблок.';
