import telebot
import sqlite3
import threading
import time
import datetime
import schedule
from dateutil.relativedelta import relativedelta


# Создаем бота
bot = telebot.TeleBot('7152650009:AAHE0rV47EhgbwfxrP0ZS8bEis6j8OLumQk')

chatid = '-1002026044298'

# Create the database connection
conn = sqlite3.connect('reminders.db')
c = conn.cursor()
c.execute('''CREATE TABLE IF NOT EXISTS reminders (chat_id INTEGER, reminder_text TEXT, reminder_date DATETIME, reminder_type TEXT)''')
conn.commit()
conn.close()  # Close the connection after setup

# Define the function to check reminders
def check_reminders():
    try:
        # Get the current time
        now = datetime.datetime.now()

        # Create a new database connection and cursor within the thread
        conn = sqlite3.connect('reminders.db')
        c = conn.cursor()

        # Get all reminders that should be sent within the next 5 minutes
        reminders = c.execute('''SELECT * FROM reminders WHERE reminder_date <= ?''', (now,)).fetchall()

        # Send reminders to users
        for reminder in reminders:
            bot.send_message(chatid, reminder[1])
            # Delete the reminder from the database
            c.execute('''DELETE FROM reminders WHERE chat_id = ? AND reminder_text = ? AND reminder_date = ?''', (reminder[0], reminder[1], reminder[2]))
            conn.commit()

        # Close the database connection
        conn.close()

    except Exception as e:
        print(f"An error occurred: {e}")

# Define the function to check reminders every 10 minutes
def check_reminders_loop():
    while True:
        check_reminders()
        time.sleep(86400)  # 1 day

# Start the thread for checking reminders every 10 minutes
reminder_thread = threading.Thread(target=check_reminders_loop)
reminder_thread.start()

# Обработчик для получения текста напоминания
def get_reminder_text(message):
    # Получаем текст напоминания
    reminder_text = message.text

    # Запрашиваем у пользователя дату начала напоминания
    bot.send_message(message.chat.id, 'Введите дату начала напоминания в формате дд.мм.гггг:')
    # Регистрируем обработчик для получения даты начала напоминания
    bot.register_next_step_handler(message, get_start_date, reminder_text)

# Функция для создания клавиатуры с выбором единиц (дни, месяцы, недели)
def get_units_keyboard():
    keyboard = telebot.types.ReplyKeyboardMarkup(row_width=1, resize_keyboard=True)
    keyboard.add(telebot.types.KeyboardButton('Дни'), telebot.types.KeyboardButton('Месяцы'), telebot.types.KeyboardButton('Недели'))
    return keyboard

# Функция для получения даты начала напоминания
def get_start_date(message, reminder_text=None):
    try:
        # Получаем дату начала напоминания
        start_date = datetime.datetime.strptime(message.text, '%d.%m.%Y')

        # Запрашиваем у пользователя единицу (дни, месяцы или недели)
        bot.send_message(message.chat.id, 'Выберите единицу для напоминания:', reply_markup=get_units_keyboard())
        # Регистрируем обработчик для получения единицы
        bot.register_next_step_handler(message, get_units, reminder_text, start_date)

    except ValueError:
        # Если формат даты неправильный, просим пользователя ввести ее снова
        bot.send_message(message.chat.id, 'Неправильный формат даты. Пожалуйста, введите дату в формате дд.мм.гггг:')
        # Регистрируем обработчик для получения правильного формата даты
        bot.register_next_step_handler(message, get_start_date, reminder_text)

# Функция для получения единицы (дни, месяцы или недели)
def get_units(message, reminder_text=None, start_date=None):
    try:
        # Получаем выбранную пользователем единицу
        unit = message.text.lower()

        # Запрашиваем у пользователя количество выбранных единиц
        bot.send_message(message.chat.id, f'Введите количество {unit}:')
        # Регистрируем обработчик для получения количества единиц
        bot.register_next_step_handler(message, get_quantity, reminder_text, start_date, unit)

    except Exception as e:
        # Если произошла ошибка, сообщаем об этом пользователю
        print(f"An error occurred: {e}")

# Функция для получения количества выбранных единиц
def get_quantity(message, reminder_text=None, start_date=None, unit=None):
    try:
        # Получаем количество выбранных единиц
        quantity = int(message.text)

        # Вычисляем дату напоминания на основе выбранных единиц и количества
        if unit == 'дни':
            reminder_date = start_date + datetime.timedelta(days=quantity)
        elif unit == 'месяцы':
            reminder_date = start_date + relativedelta(months=quantity)
        elif unit == 'недели':
            reminder_date = start_date + datetime.timedelta(weeks=quantity)
        else:
            # Если выбрана неизвестная единица, сообщаем пользователю об ошибке
            bot.send_message(message.chat.id, 'Неизвестная единица. Пожалуйста, выберите дни, месяцы или недели:')
            return

        # Добавляем напоминание в базу данных
        add_reminder_to_db(message, reminder_text, reminder_date)

    except ValueError:
        # Если введено неправильное количество единиц, просим пользователя ввести его снова
        bot.send_message(message.chat.id, f'Неправильный формат количества {unit}. Пожалуйста, введите число в числовом формате:')
        # Регистрируем обработчик для получения правильного количества единиц
        bot.register_next_step_handler(message, get_quantity, reminder_text, start_date, unit)

# Функция для добавления напоминания в базу данных
def add_reminder_to_db(message, reminder_text, reminder_date):
    try:
        # Конвертируем дату напоминания в строку
        reminder_date_str = reminder_date.strftime('%Y-%m-%d')

        # Устанавливаем тип напоминания
        reminder_type = 'One-time'

        # Создаем новое подключение к базе данных и курсор
        conn = sqlite3.connect('reminders.db')
        c = conn.cursor()

        # Добавляем напоминание в базу данных
        c.execute('''INSERT INTO reminders (chat_id, reminder_text, reminder_date, reminder_type) VALUES (?, ?, ?, ?)''', (message.chat.id, reminder_text, reminder_date_str, reminder_type))
        conn.commit()

        # Закрываем подключение к базе данных
        conn.close()

        # Отправляем сообщение пользователю о том, что напоминание добавлено
        bot.send_message(message.chat.id, 'Напоминание добавлено.', reply_markup=start_now())

    except Exception as e:
        # Если произошла ошибка, сообщаем об этом пользователю
        print(f"An error occurred: {e}")

# Function to send reminders due in two weeks
def send_two_week_reminders():
    try:
        # Get the current time and the time after two weeks
        now = datetime.datetime.now()
        two_weeks_later = now + datetime.timedelta(weeks=2)

        # Create a new database connection and cursor within the thread
        conn = sqlite3.connect('reminders.db')
        c = conn.cursor()

        # Get all reminders due in two weeks
        reminders = c.execute('''SELECT * FROM reminders WHERE reminder_date > ? AND reminder_date <= ?''', (now, two_weeks_later)).fetchall()

        # Send reminders to the specified chat
        for reminder in reminders:
            bot.send_message(chatid, f"{reminder[1]} (уценка)")

        # Close the database connection
        conn.close()

    except Exception as e:
        print(f"An error occurred: {e}")

def check_sendtwoweek():
    while True:
        send_two_week_reminders()
        time.sleep(604054)

# Start the thread for checking reminders every 10 minutes
reminder_thread = threading.Thread(target=check_sendtwoweek)
reminder_thread.start()

# Обработчик команды /start
@bot.message_handler(commands=['start'])
def start(message):
    # Создаем клавиатуру с кнопками
    keyboard = telebot.types.InlineKeyboardMarkup()
    button1 = telebot.types.InlineKeyboardButton(text='Добавить напоминание', callback_data='add_reminder')
    button2 = telebot.types.InlineKeyboardButton(text='Просмотреть напоминания', callback_data='list_reminders')
    button3 = telebot.types.InlineKeyboardButton(text='Проверить уценку', callback_data='check_discount')
    button4 = telebot.types.InlineKeyboardButton(text='Добавить список напоминаний', callback_data='add_reminder_list')
    keyboard.add(button1, button2, button3, button4)

    # Отправляем сообщение с клавиатурой
    bot.send_message(message.chat.id, 'Выберите действие:', reply_markup=keyboard)

# Обработчик нажатия на кнопку
@bot.callback_query_handler(func=lambda call: True)
def callback_query(call):
    # Получаем данные из callback_data
    data = call.data

    if data == 'add_reminder':
        # Запрашиваем у пользователя текст напоминания
        bot.send_message(call.message.chat.id, 'Введите текст напоминания:')
        # Регистрируем обработчик для получения текста напоминания
        bot.register_next_step_handler(call.message, get_reminder_text)
    elif data == 'list_reminders':
        reminders_info = list_all_reminders()
        bot.send_message(call.message.chat.id, reminders_info, reply_markup=start_now())
        # Check reminders that are due
        send_due_reminders()
    elif data == 'check_discount':
        # Check discounts immediately
        send_two_week_reminders()
    elif data == 'add_reminder_list':
        bot.send_message(call.message.chat.id, 'Введите список напоминаний в формате:\nНазвание_напоминания1 / дата1\nНазвание_напоминания2 / дата2\n...')
        bot.register_next_step_handler(call.message, get_reminder_list)

# Функция для отправки напоминаний, время которых наступило
def send_due_reminders():
    # Get the current time
    now = datetime.datetime.now()

    # Create a new database connection and cursor
    conn = sqlite3.connect('reminders.db')
    c = conn.cursor()

    # Get reminders that are due
    due_reminders = c.execute('''SELECT * FROM reminders WHERE reminder_date <= ?''', (now,)).fetchall()

    # Send due reminders to users
    for reminder in due_reminders:
        bot.send_message(chatid, reminder[1])
        # Delete the reminder from the database
        c.execute('''DELETE FROM reminders WHERE chat_id = ? AND reminder_text = ? AND reminder_date = ?''', (reminder[0], reminder[1], reminder[2]))
        conn.commit()

    # Close the database connection
    conn.close()

# Функция для получения списка всех напоминаний для всех пользователей
def list_all_reminders(page=1):
    # Create a new database connection and cursor
    conn = sqlite3.connect('reminders.db')
    c = conn.cursor()

    # Calculate the limit and offset for pagination
    limit = 20
    offset = (page - 1) * limit

    # Get reminders for the current page
    reminders = c.execute('''SELECT chat_id, reminder_text, reminder_date FROM reminders LIMIT ? OFFSET ?''', (limit, offset)).fetchall()

    # Close the database connection
    conn.close()

    if not reminders:
        return "Нету напоминаний"

    reminder_list = ""
    for reminder in reminders:
        reminder_list += f"Пользователь: {reminder[0]}, Позиция: {reminder[1]}, Время окончания: {reminder[2]}\n"

    return reminder_list

# Обработчик для получения списка напоминаний
def get_reminder_list(message):
    try:
        # Split the message into lines to extract each reminder
        reminder_lines = message.text.split('\n')

        # Create a new database connection and cursor within the thread
        conn = sqlite3.connect('reminders.db')
        c = conn.cursor()

        # Add each reminder to the database
        for line in reminder_lines:
            reminder_info = line.split('/')
            if len(reminder_info) == 2:
                reminder_text = reminder_info[0].strip()
                reminder_date = datetime.datetime.strptime(reminder_info[1].strip(), '%d.%m.%Y')
                reminder_date_str = reminder_date.strftime('%Y-%m-%d')
                reminder_type = 'One-time'
                c.execute('''INSERT INTO reminders (chat_id, reminder_text, reminder_date, reminder_type) VALUES (?, ?, ?, ?)''', (message.chat.id, reminder_text, reminder_date_str, reminder_type))
                conn.commit()

        # Close the database connection
        conn.close()

        # Send a message to the user indicating that the reminders have been added
        bot.send_message(message.chat.id, 'Список напоминаний добавлен.', reply_markup=start_now())

    except ValueError:
        
        bot.send_message(message.chat.id, 'Ошибка в формате списка напоминаний. Пожалуйста, введите список в формате:\nНазвание_напоминания1 / дата1\nНазвание_напоминания2 / дата2\n...')
        
        bot.register_next_step_handler(message, get_reminder_list)

def start_now():
    # Создаем клавиатуру с кнопками
    keyboard = telebot.types.InlineKeyboardMarkup()
    button1 = telebot.types.InlineKeyboardButton(text='Добавить напоминание', callback_data='add_reminder')
    button2 = telebot.types.InlineKeyboardButton(text='Просмотреть напоминания', callback_data='list_reminders')
    button3 = telebot.types.InlineKeyboardButton(text='Проверить уценку', callback_data='check_discount')
    button4 = telebot.types.InlineKeyboardButton(text='Добавить список напоминаний', callback_data='add_reminder_list')
    keyboard.add(button1, button2, button3, button4)
    return keyboard

# Start the bot's polling loop
bot.polling()
