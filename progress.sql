-- Уроци по ударни инструменти — SQL Dump
-- Записва се автоматично от програмата след всяка промяна. Не го редактирай на ръка.
-- Време на генериране: 28.10.2026 в 14:28
--
-- Как се отваря в phpMyAdmin: пусни XAMPP (MySQL), отвори phpMyAdmin → Import → този файл.
-- Базата `percussion_lessons` се създава сама; старите таблици в нея се заменят.

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `percussion_lessons` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `percussion_lessons`;

-- --------------------------------------------------------
-- Структура на таблица `students` — учениците

DROP TABLE IF EXISTS `students`;
CREATE TABLE `students` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `students` (`id`, `name`) VALUES
(1, '.');

-- --------------------------------------------------------
-- Структура на таблица `done` — кой ученик кой пример е изсвирил докрай и кога
-- (урок и пример се броят от 0: lesson 0, example 0 = урок 1, пример 1)

DROP TABLE IF EXISTS `done`;
CREATE TABLE `done` (
  `student_id` int(11) NOT NULL,
  `lesson` int(11) NOT NULL,
  `example` int(11) NOT NULL,
  `done_at` datetime NOT NULL,
  PRIMARY KEY (`student_id`, `lesson`, `example`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Структура на таблица `settings` — последно избраният ученик

DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `key` varchar(50) NOT NULL,
  `value` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `settings` (`key`, `value`) VALUES
('last', '.');

COMMIT;
