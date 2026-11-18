<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) die();

$s = function ($name, $default = '') {
    return ['PARENT' => 'BASE', 'NAME' => $name, 'TYPE' => 'STRING', 'DEFAULT' => $default];
};

$arComponentParameters = [
    'GROUPS' => [],
    'PARAMETERS' => [
        'IBLOCK_ID'     => $s('ID инфоблока с объектами'),
        'PROP_MAP'      => $s('Код свойства: точка на карте (широта,долгота)', 'MAP'),
        'PROP_PRODUCT'  => $s('Код свойства: вид настила', 'PRODUCT'),
        'PROP_INDUSTRY' => $s('Код свойства: отрасль', 'INDUSTRY'),
        'PROP_COUNTRY'  => $s('Код свойства: страна', 'COUNTRY'),
        'PROP_CITY'     => $s('Код свойства: город / место', 'CITY'),
        'PROP_REGION'   => $s('Код свойства: регион (необязательно)', 'REGION'),
        'PROP_TASK'     => $s('Код свойства: задача', 'TASK'),
        'PROP_SOLUTION' => $s('Код свойства: решение', 'SOLUTION'),
        'PROP_PERIOD'   => $s('Код свойства: год / период (необязательно)', 'PERIOD'),
        'DEFAULT_COUNTRY' => $s('Страна по умолчанию, если не заполнена', 'Россия'),
        'ASSETS_PATH'   => $s('Папка с файлами карты', '/local/msg-map'),
        'THEME' => [
            'PARENT' => 'BASE', 'NAME' => 'Тема по умолчанию', 'TYPE' => 'LIST',
            'VALUES' => ['dark' => 'Тёмная', 'light' => 'Светлая'], 'DEFAULT' => 'dark',
        ],
        'VIEW' => [
            'PARENT' => 'BASE', 'NAME' => 'Вид при открытии', 'TYPE' => 'LIST',
            'VALUES' => ['mercator' => 'Плоская карта', 'globe' => 'Глобус'], 'DEFAULT' => 'mercator',
        ],
        'SHOW_LINK' => [
            'PARENT' => 'BASE', 'NAME' => 'Показывать кнопку «Подробнее» (страница элемента)',
            'TYPE' => 'CHECKBOX', 'DEFAULT' => 'Y',
        ],
        'CACHE_TIME' => ['DEFAULT' => 3600],
    ],
];
