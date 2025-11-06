// Translation system
const translations = {
    en: {
        app_title: "QuizMaster Pro",
        host_game: "Host a Game",
        join_game: "Join Game",
        start_game: "Start Game",
        quiz_title: "Quiz Title",
        add_question: "Add Question",
        save_quiz: "Save Quiz",
        load_quiz: "Load Quiz",
        import_quiz: "Import Quiz",
        preview_quiz: "Preview Quiz",
        create_quiz: "Create Your Quiz",
        live_preview: "Live Preview",
        ai_generator: "AI Generator",
        toolbar: "Toolbar",
        randomize_questions: "Randomize question order",
        randomize_answers: "Randomize answer positions",
        use_same_time: "Use same time for all questions",
        manual_advancement: "Manual question advancement (host control)",
        manual_advancement_desc: "When enabled, you control when to advance to the next question",
        browse_games: "Browse Available Games",
        refresh: "Refresh",
        back_to_join: "Back to Join",
        game_pin: "Game PIN",
        share_game: "Share Game",
        players_joined: "Players Joined",
        waiting_for_game: "Waiting for game to start...",
        you_are_in: "You're in!",
        enter_game_pin: "Enter Game PIN",
        your_name: "Your Name",
        or: "OR",
        available_games: "Available Games",
        no_games_found: "No active games found",
        ask_someone_host: "Ask someone to host a game or create your own!",
        failed_load_games: "Failed to load games",
        check_connection: "Please check your connection and try again.",
        players: "players",
        questions: "questions",
        next_question: "Next Question",
        submit_answer: "Submit Answer",
        true: "TRUE",
        false: "FALSE",
        enter_answer: "Enter your answer",
        question: "Question",
        of: "of",
        welcome: "Welcome",
        waiting_for_players: "Waiting for players...",
        game_starting: "Game is starting!",
        correct_answer_msg: "Correct!",
        incorrect_answer_msg: "Incorrect!",
        submitting: "Submitting...",
        waiting_for_results: "Waiting for results...",
        points: "points",
        position: "Position",
        final_score: "Final Score",
        leaderboard: "Leaderboard",
        game_finished: "Game Finished",
        play_again: "Play Again",
        new_game: "New Game",
        question_x_of_y: "Question {0} of {1}",
        option_letter_a: "A",
        option_letter_b: "B",
        option_letter_c: "C",
        option_letter_d: "D",
        time_up_msg: "Time's up!",
        all_players_answered: "All players answered!",
        waiting_host_advance: "Waiting for host to advance...",
        share_with_qr_code: "Share with QR Code",
        scan_to_join: "Scan to join",
        copy_game_url: "Copy Game URL",
        generating_questions: "Generating questions...",
        questions_generated: "Questions generated successfully",
        error_generating: "Error generating questions",
        select_question_preview: "Select a question to preview",
        generating_qr: "Generating QR Code...",
        no_questions: "No questions",
        enter_question_preview: "Enter your question above to see preview",
        add_question_preview: "Add a question to see preview",
        please_enter_quiz_title: "Please enter a quiz title",
        please_add_one_question: "Please add at least one question",
        question_missing_text: "Question {0} is missing question text",
        question_needs_two_options: "Question {0} needs at least 2 valid options",
        please_enter_pin_and_name: "Please enter both game PIN and your name",
        pin_must_be_six_digits: "Game PIN must be exactly 6 digits",
        name_max_twenty_chars: "Name must be 20 characters or less",
        not_connected_refresh: "Not connected to server. Please refresh the page.",
        please_enter_valid_number: "Please enter a valid number",
        please_select_csv_json: "Please select a CSV or JSON file",
        invalid_file_format: "Invalid file format. Please check the file structure.",
        error_importing_file: "Error importing file. Please check the file format.",
        quiz_saved_successfully: "Quiz saved successfully as {0}",
        failed_save_quiz: "Failed to save quiz",
        failed_load_quiz_list: "Failed to load quiz list",
        quiz_loaded_successfully: "Quiz \"{0}\" loaded successfully!",
        failed_load_quiz: "Failed to load quiz",
        failed_upload_image: "Failed to upload image",
        pdf_parsing_future_update: "PDF parsing will be added in a future update...",
        docx_parsing_future_update: "DOCX parsing will be added in a future update...",
        unsupported_file_format: "Unsupported file format. Please use TXT or MD files...",
        error_reading_file: "Error reading file. Please try again...",
        please_provide_source_material: "Please provide source material to generate questions from.",
        please_enter_api_key: "Please enter your API key for the selected provider.",
        error_generating_questions_detail: "Error generating questions: {0}",
        failed_generate_qr_code: "Failed to generate QR code",
        loading_games: "Loading games...",
        loading_models: "Loading models...",
        error_loading_models: "Error loading models",
        correct_answer_banner: "✅ Correct Answer: {0}",
        option_text_placeholder: "Option text",
        restore_autosave_confirm: "Found auto-saved quiz draft. Would you like to restore it?",
        import_quiz_confirm: "Import \"{0}\" with {1} questions? This will replace your current quiz.",
        successfully_imported_questions: "Successfully imported {0} questions!",
        successfully_generated_questions: "Successfully generated {0} questions!",
        previous: "Previous",
        next: "Next",
        no_file_uploaded: "No file uploaded",
        upload_failed: "Upload failed",
        invalid_quiz_data: "Invalid quiz data",
        untitled_quiz: "Untitled Quiz",
        enter_question_with_latex: "Enter your question (supports LaTeX: $x^2 + y^2 = z^2$)",
        general_content: "general",
        mathematics_content: "mathematics",
        programming_content: "programming",
        physics_content: "physics",
        chemistry_content: "chemistry",
        standard_formatting: "Questions will use standard formatting",
        math_formatting: "Questions will include LaTeX formatting for equations",
        code_formatting: "Questions will include syntax highlighting for code",
        physics_formatting: "Questions will include scientific notation and units",
        chemistry_formatting: "Questions will include chemical formulas and equations",
        choose_ai_provider: "Choose AI Provider:",
        source_material: "Source Material:",
        number_of_questions: "Number of Questions:",
        difficulty_level: "Difficulty Level:",
        question_types: "Question Types:",
        mixed: "Mixed",
        api_key: "API Key:",
        api_key_stored_locally: "Your API key is stored locally and never sent to our servers",
        choose_model: "Choose Model:",
        select_ollama_model: "Select which Ollama model to use for generation",
        paste_content_here: "Paste your text content here, or upload a file below...",
        content_type_detected: "Content type detected:",
        or_upload_file: "Or upload a file:",
        supported_formats: "Supported formats: TXT, PDF, DOCX, Markdown",
        cancel: "Cancel",
        generate_questions_btn: "Generate Questions",
        ollama_free_local: "Ollama (Free, Local)",
        huggingface_free: "Hugging Face (Free tier)",
        openai_paid: "OpenAI (Paid)",
        claude_paid: "Anthropic Claude (Paid)",
        multiple_choice_type: "Multiple Choice",
        true_false_type: "True/False",
        multiple_correct_type: "Multiple Correct Answers",
        numeric_answer_type: "Numeric Answer",
        
        // Additional UI elements and messages
        submit: "Submit",
        submit_answer: "Submit Answer",
        question_preview: "Question Preview",
        close: "Close",
        reset: "Reset",
        question_will_appear_here: "Question will appear here",
        questions_will_appear_here: "Questions will appear here",
        live_answer_statistics: "Live Answer Statistics",
        next_question: "Next Question",
        leaderboard_title: "🏆 Leaderboard",
        game_complete: "🎉 Game Complete!",
        quiz_complete: "🎉 Quiz Complete!",
        your_final_rank: "Your Final Rank",
        top_players: "🏆 Top Players",
        preview_settings_title: "⚙️ Preview Settings",
        split_ratio: "Split Ratio",
        font_size: "Font Size",
        spacing: "Spacing",
        button_size: "Button Size",
        normal: "Normal",
        minimal: "Minimal",
        comfortable: "Comfortable",
        spacious: "Spacious",
        small: "Small",
        large: "Large",
        extra_large: "Extra Large",
        
        // Error messages and alerts
        scroll_shortcuts_only_when_preview: "Scroll shortcuts only work when Live Preview is active",
        please_add_question_to_preview: "Please add at least one question to preview",
        csv_header_required: "CSV must have header and at least one data row",
        failed_fetch_models: "Failed to fetch models",
        no_models_available: "No models available",
        error_loading_models_detail: "Error loading models",
        unsupported_provider: "Unsupported provider",
        no_questions_generated: "No questions were generated",
        select_ollama_model_first: "Please select an Ollama model first",
        cannot_connect_ollama: "Cannot connect to Ollama. Make sure Ollama is installed and running locally.",
        huggingface_integration_coming: "Hugging Face integration coming soon",
        enter_claude_api_key: "Please enter your Claude API key",
        cannot_connect_claude: "Cannot connect to Claude API. Please check your internet connection.",
        no_valid_json_response: "No valid JSON found in response",
        failed_parse_ai_response: "Failed to parse AI response. Please try again.",
        
        // Game flow messages
        pin_detected: "PIN detected: ",
        no_saved_quizzes_found: "No saved quizzes found.",
        imported_quiz: "Imported Quiz",
        true_display: "True",
        false_display: "False",
        na_position: "N/A",
        
        // Additional placeholders
        enter_api_key_placeholder: "Enter your API key",
        loading_models_placeholder: "Loading models...",
        
        // Preview content
        close_preview: "❌ Close Preview",
        toggle_live_preview: "📱 Toggle Live Preview",
        
        // Response summary text
        of_players_responded: "of {0} players responded",
        
        // Image alt text
        question_image: "Question Image"
    },
    es: {
        app_title: "QuizMaster Pro",
        host_game: "Crear Juego",
        join_game: "Unirse al Juego",
        start_game: "Iniciar Juego",
        quiz_title: "Título del Quiz",
        add_question: "Agregar Pregunta",
        save_quiz: "Guardar Quiz",
        load_quiz: "Cargar Quiz",
        import_quiz: "Importar Quiz",
        preview_quiz: "Vista Previa",
        randomize_questions: "Aleatorizar orden de preguntas",
        randomize_answers: "Aleatorizar posiciones de respuestas",
        use_same_time: "Usar el mismo tiempo para todas las preguntas",
        manual_advancement: "Avance manual de preguntas (control del anfitrión)",
        manual_advancement_desc: "Cuando está habilitado, tú controlas cuándo avanzar a la siguiente pregunta",
        browse_games: "Explorar Juegos Disponibles",
        refresh: "Actualizar",
        back_to_join: "Volver a Unirse",
        game_pin: "PIN del Juego",
        share_game: "Compartir Juego",
        players_joined: "Jugadores Unidos",
        waiting_for_game: "Esperando que comience el juego...",
        you_are_in: "¡Estás dentro!",
        enter_game_pin: "Ingresa el PIN del Juego",
        your_name: "Tu Nombre",
        or: "O",
        available_games: "Juegos Disponibles",
        no_games_found: "No se encontraron juegos activos",
        ask_someone_host: "¡Pide a alguien que cree un juego o crea el tuyo!",
        failed_load_games: "Error al cargar juegos",
        check_connection: "Verifica tu conexión e intenta de nuevo.",
        players: "jugadores",
        questions: "preguntas",
        next_question: "Siguiente Pregunta",
        submit_answer: "Enviar Respuesta",
        true: "VERDADERO",
        false: "FALSO",
        enter_answer: "Ingresa tu respuesta",
        question: "Pregunta",
        of: "de",
        create_quiz: "Crear tu Quiz",
        live_preview: "Vista Previa en Vivo",
        preview_settings: "Configuración de Vista Previa",
        share_with_qr: "Compartir con QR",
        game_url: "URL del Juego",
        time_limit: "Límite de Tiempo",
        correct_answer: "Respuesta Correcta",
        option_a: "Opción A",
        option_b: "Opción B",
        option_c: "Opción C",
        option_d: "Opción D",
        enter_question: "Ingresa tu pregunta",
        a_is_correct: "A es correcto",
        b_is_correct: "B es correcto",
        c_is_correct: "C es correcto",
        d_is_correct: "D es correcto",
        numeric_answer: "Respuesta Numérica",
        tolerance: "Tolerancia",
        edit_question: "Editar Pregunta",
        load_saved_quiz: "Cargar Quiz Guardado",
        question_number: "Pregunta",
        waiting_for_players: "Esperando jugadores...",
        game_starting: "¡El juego está comenzando!",
        final_results: "Resultados Finales",
        your_score: "Tu Puntuación",
        rank: "Puesto",
        answer_submitted: "Respuesta Enviada",
        correct: "¡Correcto!",
        incorrect: "Incorrecto",
        time_up: "¡Se acabó el tiempo!",
        next_question_manual: "Siguiente Pregunta (Control Manual)",
        ai_generator: "Generador IA",
        toolbar: "Barra de Herramientas",
        back_to_top: "Volver Arriba",
        remove_image: "Eliminar Imagen",
        add_image: "Agregar Imagen",
        multiple_choice: "Opción Múltiple",
        multiple_correct: "Respuestas Múltiples Correctas",
        true_false: "Verdadero/Falso",
        numeric: "Respuesta Numérica",
        easy: "Fácil",
        medium: "Medio",
        hard: "Difícil",
        time_seconds: "Tiempo (seg)",
        enter_numeric_answer: "Ingresa respuesta numérica",
        global_time_limit: "Límite de tiempo global (segundos)",
        quick_actions: "Acciones Rápidas",
        tools: "Herramientas",
        navigate: "Navegar",
        settings: "Configuración",
        hide: "Ocultar",
        top: "Arriba",
        bottom: "Abajo",
        preview: "Vista Previa",
        welcome: "¡Bienvenido",
        waiting_for_players: "Esperando jugadores...",
        game_starting: "¡El juego está comenzando!",
        correct_answer_msg: "¡Correcto!",
        incorrect_answer_msg: "¡Incorrecto!",
        submitting: "Enviando...",
        waiting_for_results: "Esperando resultados...",
        points: "puntos",
        position: "Posición",
        final_score: "Puntuación Final",
        leaderboard: "Tabla de Posiciones",
        game_finished: "Juego Terminado",
        play_again: "Jugar de Nuevo",
        new_game: "Nuevo Juego",
        question_x_of_y: "Pregunta {0} de {1}",
        option_letter_a: "A",
        option_letter_b: "B", 
        option_letter_c: "C",
        option_letter_d: "D",
        time_up_msg: "¡Se acabó el tiempo!",
        all_players_answered: "¡Todos los jugadores respondieron!",
        waiting_host_advance: "Esperando que el anfitrión avance...",
        share_with_qr_code: "Compartir con Código QR",
        scan_to_join: "Escanea para unirte",
        copy_game_url: "Copiar URL del Juego",
        generating_questions: "Generando preguntas...",
        questions_generated: "Preguntas generadas exitosamente",
        error_generating: "Error al generar preguntas",
        select_question_preview: "Selecciona una pregunta para vista previa",
        generating_qr: "Generando Código QR...",
        no_questions: "Sin preguntas",
        enter_question_preview: "Ingresa tu pregunta arriba para ver vista previa",
        add_question_preview: "Agrega una pregunta para ver vista previa",
        please_enter_quiz_title: "Por favor ingresa un título para el quiz",
        please_add_one_question: "Por favor agrega al menos una pregunta",
        question_missing_text: "La pregunta {0} no tiene texto",
        question_needs_two_options: "La pregunta {0} necesita al menos 2 opciones válidas",
        please_enter_pin_and_name: "Por favor ingresa tanto el PIN del juego como tu nombre",
        pin_must_be_six_digits: "El PIN del juego debe tener exactamente 6 dígitos",
        name_max_twenty_chars: "El nombre debe tener 20 caracteres o menos",
        not_connected_refresh: "No conectado al servidor. Por favor actualiza la página.",
        please_enter_valid_number: "Por favor ingresa un número válido",
        please_select_csv_json: "Por favor selecciona un archivo CSV o JSON",
        invalid_file_format: "Formato de archivo inválido. Por favor verifica la estructura del archivo.",
        error_importing_file: "Error al importar archivo. Por favor verifica el formato del archivo.",
        quiz_saved_successfully: "Quiz guardado exitosamente como {0}",
        failed_save_quiz: "Error al guardar quiz",
        failed_load_quiz_list: "Error al cargar lista de quizzes",
        quiz_loaded_successfully: "Quiz \"{0}\" cargado exitosamente!",
        failed_load_quiz: "Error al cargar quiz",
        failed_upload_image: "Error al subir imagen",
        pdf_parsing_future_update: "El análisis de PDF se agregará en una actualización futura...",
        docx_parsing_future_update: "El análisis de DOCX se agregará en una actualización futura...",
        unsupported_file_format: "Formato de archivo no soportado. Por favor usa archivos TXT o MD...",
        error_reading_file: "Error al leer archivo. Por favor intenta de nuevo...",
        please_provide_source_material: "Por favor proporciona material fuente para generar preguntas.",
        please_enter_api_key: "Por favor ingresa tu clave API para el proveedor seleccionado.",
        error_generating_questions_detail: "Error generando preguntas: {0}",
        failed_generate_qr_code: "Error al generar código QR",
        loading_games: "Cargando juegos...",
        loading_models: "Cargando modelos...",
        error_loading_models: "Error al cargar modelos",
        correct_answer_banner: "✅ Respuesta Correcta: {0}",
        option_text_placeholder: "Texto de opción",
        restore_autosave_confirm: "Se encontró un borrador de quiz auto-guardado. ¿Te gustaría restaurarlo?",
        import_quiz_confirm: "¿Importar \"{0}\" con {1} preguntas? Esto reemplazará tu quiz actual.",
        successfully_imported_questions: "¡{0} preguntas importadas exitosamente!",
        successfully_generated_questions: "¡{0} preguntas generadas exitosamente!",
        previous: "Anterior",
        next: "Siguiente",
        no_file_uploaded: "No se subió archivo",
        upload_failed: "Error al subir",
        invalid_quiz_data: "Datos de quiz inválidos",
        untitled_quiz: "Quiz Sin Título",
        enter_question_with_latex: "Ingresa tu pregunta (soporta LaTeX: $x^2 + y^2 = z^2$)",
        general_content: "general",
        mathematics_content: "matemáticas",
        programming_content: "programación",
        physics_content: "física",
        chemistry_content: "química",
        standard_formatting: "Las preguntas usarán formato estándar",
        math_formatting: "Las preguntas incluirán formato LaTeX para ecuaciones",
        code_formatting: "Las preguntas incluirán resaltado de sintaxis para código",
        physics_formatting: "Las preguntas incluirán notación científica y unidades",
        chemistry_formatting: "Las preguntas incluirán fórmulas y ecuaciones químicas",
        choose_ai_provider: "Elegir Proveedor de IA:",
        source_material: "Material Fuente:",
        number_of_questions: "Número de Preguntas:",
        difficulty_level: "Nivel de Dificultad:",
        question_types: "Tipos de Preguntas:",
        mixed: "Mixto",
        api_key: "Clave API:",
        api_key_stored_locally: "Tu clave API se almacena localmente y nunca se envía a nuestros servidores",
        choose_model: "Elegir Modelo:",
        select_ollama_model: "Selecciona qué modelo de Ollama usar para la generación",
        paste_content_here: "Pega tu contenido de texto aquí, o sube un archivo abajo...",
        content_type_detected: "Tipo de contenido detectado:",
        or_upload_file: "O sube un archivo:",
        supported_formats: "Formatos soportados: TXT, PDF, DOCX, Markdown",
        cancel: "Cancelar",
        generate_questions_btn: "Generar Preguntas",
        ollama_free_local: "Ollama (Gratis, Local)",
        huggingface_free: "Hugging Face (Nivel gratuito)",
        openai_paid: "OpenAI (Pago)",
        claude_paid: "Anthropic Claude (Pago)",
        multiple_choice_type: "Opción Múltiple",
        true_false_type: "Verdadero/Falso",
        multiple_correct_type: "Respuestas Múltiples Correctas",
        numeric_answer_type: "Respuesta Numérica",
        
        // Additional UI elements and messages
        submit: "Enviar",
        submit_answer: "Enviar Respuesta",
        question_preview: "Vista Previa de Pregunta",
        close: "Cerrar",
        reset: "Restablecer",
        question_will_appear_here: "La pregunta aparecerá aquí",
        questions_will_appear_here: "Las preguntas aparecerán aquí",
        live_answer_statistics: "Estadísticas de Respuestas en Vivo",
        next_question: "Siguiente Pregunta",
        leaderboard_title: "🏆 Tabla de Posiciones",
        game_complete: "🎉 ¡Juego Completado!",
        quiz_complete: "🎉 ¡Quiz Completado!",
        your_final_rank: "Tu Clasificación Final",
        top_players: "🏆 Mejores Jugadores",
        preview_settings_title: "⚙️ Configuración de Vista Previa",
        split_ratio: "Proporción de División",
        font_size: "Tamaño de Fuente",
        spacing: "Espaciado",
        button_size: "Tamaño de Botón",
        normal: "Normal",
        minimal: "Mínimo",
        comfortable: "Cómodo",
        spacious: "Espacioso",
        small: "Pequeño",
        large: "Grande",
        extra_large: "Extra Grande",
        
        // Error messages and alerts
        scroll_shortcuts_only_when_preview: "Los atajos de desplazamiento solo funcionan cuando la Vista Previa está activa",
        please_add_question_to_preview: "Por favor agrega al menos una pregunta para vista previa",
        csv_header_required: "CSV debe tener encabezado y al menos una fila de datos",
        failed_fetch_models: "Error al obtener modelos",
        no_models_available: "No hay modelos disponibles",
        error_loading_models_detail: "Error al cargar modelos",
        unsupported_provider: "Proveedor no soportado",
        no_questions_generated: "No se generaron preguntas",
        select_ollama_model_first: "Por favor selecciona un modelo de Ollama primero",
        cannot_connect_ollama: "No se puede conectar a Ollama. Asegúrate de que Ollama esté instalado y ejecutándose localmente.",
        huggingface_integration_coming: "La integración con Hugging Face llegará pronto",
        enter_claude_api_key: "Por favor ingresa tu clave API de Claude",
        cannot_connect_claude: "No se puede conectar a la API de Claude. Verifica tu conexión a internet.",
        no_valid_json_response: "No se encontró JSON válido en la respuesta",
        failed_parse_ai_response: "Error al analizar respuesta de IA. Inténtalo de nuevo.",
        
        // Game flow messages
        pin_detected: "PIN detectado: ",
        no_saved_quizzes_found: "No se encontraron quizzes guardados.",
        imported_quiz: "Quiz Importado",
        true_display: "Verdadero",
        false_display: "Falso",
        na_position: "N/A",
        
        // Additional placeholders
        enter_api_key_placeholder: "Ingresa tu clave API",
        loading_models_placeholder: "Cargando modelos...",
        
        // Preview content
        close_preview: "❌ Cerrar Vista Previa",
        toggle_live_preview: "📱 Alternar Vista Previa",
        
        // Response summary text
        of_players_responded: "de {0} jugadores respondieron",
        
        // Image alt text
        question_image: "Imagen de Pregunta"
    },
    pl: {
        app_title: "QuizMaster Pro",
        host_game: "Prowadź Grę",
        join_game: "Dołącz do Gry",
        start_game: "Rozpocznij Grę",
        quiz_title: "Tytuł Quizu",
        add_question: "Dodaj Pytanie",
        save_quiz: "Zapisz Quiz",
        load_quiz: "Wczytaj Quiz",
        import_quiz: "Importuj Quiz",
        preview_quiz: "Podgląd Quizu",
        randomize_questions: "Losowa kolejność pytań",
        randomize_answers: "Losowa pozycja odpowiedzi",
        use_same_time: "Użyj tego samego czasu dla wszystkich pytań",
        manual_advancement: "Ręczne przechodzenie do następnego pytania (kontrola prowadzącego)",
        manual_advancement_desc: "Gdy włączone, kontrolujesz kiedy przejść do następnego pytania",
        browse_games: "Przeglądaj Dostępne Gry",
        refresh: "Odśwież",
        back_to_join: "Powrót do Dołączania",
        game_pin: "PIN Gry",
        share_game: "Udostępnij Grę",
        players_joined: "Dołączeni Gracze",
        waiting_for_game: "Oczekiwanie na rozpoczęcie gry...",
        you_are_in: "Jesteś w grze!",
        enter_game_pin: "Wprowadź PIN Gry",
        your_name: "Twoje Imię",
        or: "LUB",
        available_games: "Dostępne Gry",
        no_games_found: "Nie znaleziono aktywnych gier",
        ask_someone_host: "Poproś kogoś o prowadzenie gry lub stwórz własną!",
        failed_load_games: "Błąd ładowania gier",
        check_connection: "Sprawdź połączenie i spróbuj ponownie.",
        players: "gracze",
        questions: "pytania",
        next_question: "Następne Pytanie",
        submit_answer: "Wyślij Odpowiedź",
        true: "PRAWDA",
        false: "FAŁSZ",
        enter_answer: "Wprowadź swoją odpowiedź",
        question: "Pytanie",
        of: "z",
        welcome: "Witaj",
        waiting_for_players: "Oczekiwanie na graczy...",
        game_starting: "Gra się rozpoczyna!",
        correct_answer_msg: "Prawidłowo!",
        incorrect_answer_msg: "Nieprawidłowo!",
        submitting: "Wysyłanie...",
        waiting_for_results: "Oczekiwanie na wyniki...",
        points: "punkty",
        position: "Pozycja",
        final_score: "Wynik Końcowy",
        leaderboard: "Ranking",
        game_finished: "Gra Zakończona",
        play_again: "Zagraj Ponownie",
        new_game: "Nowa Gra",
        question_x_of_y: "Pytanie {0} z {1}",
        option_letter_a: "A",
        option_letter_b: "B",
        option_letter_c: "C",
        option_letter_d: "D",
        time_up_msg: "Czas minął!",
        all_players_answered: "Wszyscy gracze odpowiedzieli!",
        waiting_host_advance: "Oczekiwanie na prowadzącego...",
        share_with_qr_code: "Udostępnij Kodem QR",
        scan_to_join: "Zeskanuj aby dołączyć",
        copy_game_url: "Kopiuj URL Gry",
        generating_questions: "Generowanie pytań...",
        questions_generated: "Pytania wygenerowane pomyślnie",
        error_generating: "Błąd generowania pytań",
        select_question_preview: "Wybierz pytanie do podglądu",
        generating_qr: "Generowanie Kodu QR...",
        no_questions: "Brak pytań",
        enter_question_preview: "Wprowadź pytanie powyżej aby zobaczyć podgląd",
        add_question_preview: "Dodaj pytanie aby zobaczyć podgląd",
        create_quiz: "Stwórz Swój Quiz",
        live_preview: "Podgląd Na Żywo",
        preview_settings: "Ustawienia Podglądu",
        share_with_qr: "Udostępnij przez QR",
        game_url: "URL Gry",
        time_limit: "Limit Czasu",
        correct_answer: "Prawidłowa Odpowiedź",
        option_a: "Opcja A",
        option_b: "Opcja B",
        option_c: "Opcja C",
        option_d: "Opcja D",
        enter_question: "Wprowadź swoje pytanie",
        a_is_correct: "A jest prawidłowe",
        b_is_correct: "B jest prawidłowe",
        c_is_correct: "C jest prawidłowe",
        d_is_correct: "D jest prawidłowe",
        numeric_answer: "Odpowiedź Numeryczna",
        tolerance: "Tolerancja",
        edit_question: "Edytuj Pytanie",
        load_saved_quiz: "Wczytaj Zapisany Quiz",
        question_number: "Pytanie",
        waiting_for_players: "Oczekiwanie na graczy...",
        game_starting: "Gra się rozpoczyna!",
        final_results: "Wyniki Końcowe",
        your_score: "Twój Wynik",
        rank: "Miejsce",
        answer_submitted: "Odpowiedź Wysłana",
        correct: "Prawidłowo!",
        incorrect: "Nieprawidłowo",
        time_up: "Czas minął!",
        next_question_manual: "Następne Pytanie (Kontrola Ręczna)",
        ai_generator: "Generator AI",
        toolbar: "Pasek Narzędzi",
        back_to_top: "Powrót na Górę",
        remove_image: "Usuń Obraz",
        add_image: "Dodaj Obraz",
        multiple_choice: "Wybór Wielokrotny",
        multiple_correct: "Wiele Prawidłowych Odpowiedzi",
        true_false: "Prawda/Fałsz",
        numeric: "Odpowiedź Numeryczna",
        easy: "Łatwy",
        medium: "Średni",
        hard: "Trudny",
        time_seconds: "Czas (sek)",
        enter_numeric_answer: "Wprowadź odpowiedź numeryczną",
        global_time_limit: "Globalny limit czasu (sekundy)",
        quick_actions: "Szybkie Akcje",
        tools: "Narzędzia",
        navigate: "Nawigacja",
        settings: "Ustawienia",
        hide: "Ukryj",
        top: "Góra",
        bottom: "Dół",
        preview: "Podgląd",
        please_enter_quiz_title: "Proszę wprowadzić tytuł quizu",
        please_add_one_question: "Proszę dodać co najmniej jedno pytanie",
        question_missing_text: "Pytanie {0} nie ma tekstu",
        question_needs_two_options: "Pytanie {0} potrzebuje co najmniej 2 prawidłowych opcji",
        please_enter_pin_and_name: "Proszę wprowadzić PIN gry i swoje imię",
        pin_must_be_six_digits: "PIN gry musi mieć dokładnie 6 cyfr",
        name_max_twenty_chars: "Imię musi mieć 20 znaków lub mniej",
        not_connected_refresh: "Brak połączenia z serwerem. Proszę odświeżyć stronę.",
        please_enter_valid_number: "Proszę wprowadzić prawidłowy numer",
        please_select_csv_json: "Proszę wybrać plik CSV lub JSON",
        invalid_file_format: "Nieprawidłowy format pliku. Proszę sprawdzić strukturę pliku.",
        error_importing_file: "Błąd importowania pliku. Proszę sprawdzić format pliku.",
        quiz_saved_successfully: "Quiz zapisany pomyślnie jako {0}",
        failed_save_quiz: "Błąd zapisu quizu",
        failed_load_quiz_list: "Błąd ładowania listy quizów",
        quiz_loaded_successfully: "Quiz \"{0}\" wczytany pomyślnie!",
        failed_load_quiz: "Błąd wczytywania quizu",
        failed_upload_image: "Błąd przesyłania obrazu",
        pdf_parsing_future_update: "Parsowanie PDF zostanie dodane w przyszłej aktualizacji...",
        docx_parsing_future_update: "Parsowanie DOCX zostanie dodane w przyszłej aktualizacji...",
        unsupported_file_format: "Nieobsługiwany format pliku. Proszę używać plików TXT lub MD...",
        error_reading_file: "Błąd odczytu pliku. Proszę spróbować ponownie...",
        please_provide_source_material: "Proszę podać materiał źródłowy do generowania pytań.",
        please_enter_api_key: "Proszę wprowadzić klucz API dla wybranego dostawcy.",
        error_generating_questions_detail: "Błąd generowania pytań: {0}",
        failed_generate_qr_code: "Błąd generowania kodu QR",
        loading_games: "Ładowanie gier...",
        loading_models: "Ładowanie modeli...",
        error_loading_models: "Błąd ładowania modeli",
        correct_answer_banner: "✅ Prawidłowa Odpowiedź: {0}",
        option_text_placeholder: "Tekst opcji",
        restore_autosave_confirm: "Znaleziono automatycznie zapisany szkic quizu. Czy chciałbyś go przywrócić?",
        import_quiz_confirm: "Importować \"{0}\" z {1} pytaniami? To zastąpi twój obecny quiz.",
        successfully_imported_questions: "Pomyślnie zaimportowano {0} pytań!",
        successfully_generated_questions: "Pomyślnie wygenerowano {0} pytań!",
        previous: "Poprzedni",
        next: "Następny",
        no_file_uploaded: "Nie przesłano pliku",
        upload_failed: "Błąd przesyłania",
        invalid_quiz_data: "Nieprawidłowe dane quizu",
        untitled_quiz: "Quiz Bez Tytułu",
        enter_question_with_latex: "Wprowadź swoje pytanie (obsługuje LaTeX: $x^2 + y^2 = z^2$)",
        general_content: "ogólne",
        mathematics_content: "matematyka",
        programming_content: "programowanie",
        physics_content: "fizyka",
        chemistry_content: "chemia",
        standard_formatting: "Pytania będą używać standardowego formatowania",
        math_formatting: "Pytania będą zawierać formatowanie LaTeX dla równań",
        code_formatting: "Pytania będą zawierać podświetlanie składni dla kodu",
        physics_formatting: "Pytania będą zawierać notację naukową i jednostki",
        chemistry_formatting: "Pytania będą zawierać wzory i równania chemiczne",
        choose_ai_provider: "Wybierz Dostawcę AI:",
        source_material: "Materiał Źródłowy:",
        number_of_questions: "Liczba Pytań:",
        difficulty_level: "Poziom Trudności:",
        question_types: "Typy Pytań:",
        mixed: "Mieszane",
        api_key: "Klucz API:",
        api_key_stored_locally: "Twój klucz API jest przechowywany lokalnie i nigdy nie jest wysyłany na nasze serwery",
        choose_model: "Wybierz Model:",
        select_ollama_model: "Wybierz który model Ollama użyć do generowania",
        paste_content_here: "Wklej tutaj swoją treść tekstową, lub prześlij plik poniżej...",
        content_type_detected: "Wykryto typ treści:",
        or_upload_file: "Lub prześlij plik:",
        supported_formats: "Obsługiwane formaty: TXT, PDF, DOCX, Markdown",
        cancel: "Anuluj",
        generate_questions_btn: "Generuj Pytania",
        ollama_free_local: "Ollama (Darmowy, Lokalny)",
        huggingface_free: "Hugging Face (Darmowy poziom)",
        openai_paid: "OpenAI (Płatny)",
        claude_paid: "Anthropic Claude (Płatny)",
        multiple_choice_type: "Wybór Wielokrotny",
        true_false_type: "Prawda/Fałsz",
        multiple_correct_type: "Wiele Prawidłowych Odpowiedzi",
        numeric_answer_type: "Odpowiedź Numeryczna",
        
        // Additional UI elements and messages
        submit: "Wyślij",
        submit_answer: "Wyślij Odpowiedź",
        question_preview: "Podgląd Pytania",
        close: "Zamknij",
        reset: "Resetuj",
        question_will_appear_here: "Pytanie pojawi się tutaj",
        questions_will_appear_here: "Pytania pojawią się tutaj",
        live_answer_statistics: "Statystyki Odpowiedzi na Żywo",
        next_question: "Następne Pytanie",
        leaderboard_title: "🏆 Ranking",
        game_complete: "🎉 Gra Ukończona!",
        quiz_complete: "🎉 Quiz Ukończony!",
        your_final_rank: "Twoja Końcowa Pozycja",
        top_players: "🏆 Najlepsi Gracze",
        preview_settings_title: "⚙️ Ustawienia Podglądu",
        split_ratio: "Proporcja Podziału",
        font_size: "Rozmiar Czcionki",
        spacing: "Odstępy",
        button_size: "Rozmiar Przycisków",
        normal: "Normalny",
        minimal: "Minimalny",
        comfortable: "Wygodny",
        spacious: "Przestronny",
        small: "Mały",
        large: "Duży",
        extra_large: "Bardzo Duży",
        
        // Error messages and alerts
        scroll_shortcuts_only_when_preview: "Skróty przewijania działają tylko gdy Podgląd na Żywo jest aktywny",
        please_add_question_to_preview: "Proszę dodać co najmniej jedno pytanie do podglądu",
        csv_header_required: "CSV musi mieć nagłówek i co najmniej jeden wiersz danych",
        failed_fetch_models: "Błąd pobierania modeli",
        no_models_available: "Brak dostępnych modeli",
        error_loading_models_detail: "Błąd ładowania modeli",
        unsupported_provider: "Nieobsługiwany dostawca",
        no_questions_generated: "Nie wygenerowano pytań",
        select_ollama_model_first: "Proszę najpierw wybrać model Ollama",
        cannot_connect_ollama: "Nie można połączyć z Ollama. Upewnij się, że Ollama jest zainstalowana i uruchomiona lokalnie.",
        huggingface_integration_coming: "Integracja z Hugging Face wkrótce",
        enter_claude_api_key: "Proszę wprowadzić klucz API Claude",
        cannot_connect_claude: "Nie można połączyć z API Claude. Sprawdź połączenie internetowe.",
        no_valid_json_response: "Nie znaleziono prawidłowego JSON w odpowiedzi",
        failed_parse_ai_response: "Błąd analizy odpowiedzi AI. Spróbuj ponownie.",
        
        // Game flow messages
        pin_detected: "Wykryto PIN: ",
        no_saved_quizzes_found: "Nie znaleziono zapisanych quizów.",
        imported_quiz: "Importowany Quiz",
        true_display: "Prawda",
        false_display: "Fałsz",
        na_position: "N/D",
        
        // Additional placeholders
        enter_api_key_placeholder: "Wprowadź swój klucz API",
        loading_models_placeholder: "Ładowanie modeli...",
        
        // Preview content
        close_preview: "❌ Zamknij Podgląd",
        toggle_live_preview: "📱 Przełącz Podgląd na Żywo",
        
        // Response summary text
        of_players_responded: "z {0} graczy odpowiedziało",
        
        // Image alt text
        question_image: "Obraz Pytania"
    }
};

let currentLanguage = 'en';

// Helper function to get translated text
function getTranslation(key, ...args) {
    let text = (translations[currentLanguage] && translations[currentLanguage][key]) || key;
    // Handle placeholder substitution {0}, {1}, etc.
    args.forEach((arg, index) => {
        text = text.replace(`{${index}}`, arg);
    });
    return text;
}

// Helper function to set translated text content
function setTranslatedText(elementOrId, translationKey, ...args) {
    const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (element) {
        element.textContent = getTranslation(translationKey, ...args);
    }
}

// Helper function to set translated HTML content
function setTranslatedHTML(elementOrId, translationKey, ...args) {
    const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (element) {
        element.innerHTML = getTranslation(translationKey, ...args);
    }
}

// Helper function to get option letter (A, B, C, D) in current language
function getOptionLetter(index) {
    const letters = ['option_letter_a', 'option_letter_b', 'option_letter_c', 'option_letter_d'];
    return getTranslation(letters[index] || 'option_letter_a');
}

// Helper function for translated alerts
function showAlert(translationKey, ...args) {
    alert(getTranslation(translationKey, ...args));
}

// Helper function for translated confirmations
function showConfirm(translationKey, ...args) {
    return confirm(getTranslation(translationKey, ...args));
}

function translatePage() {
    // Skip elements that contain dynamic game content
    const skipElements = ['current-question', 'player-question-text', 'host-question-text', 'preview-question-text', 'preview-question-text-split'];
    
    const elements = document.querySelectorAll('[data-translate]');
    elements.forEach(element => {
        // Skip translation for dynamic content elements
        if (skipElements.includes(element.id) || element.dataset.hasContent === 'true') {
            return;
        }
        
        const key = element.getAttribute('data-translate');
        if (translations[currentLanguage] && translations[currentLanguage][key]) {
            element.textContent = translations[currentLanguage][key];
        }
    });
    
    // Handle placeholder translations
    const placeholderElements = document.querySelectorAll('[data-translate-placeholder]');
    placeholderElements.forEach(element => {
        const key = element.getAttribute('data-translate-placeholder');
        if (translations[currentLanguage] && translations[currentLanguage][key]) {
            element.placeholder = translations[currentLanguage][key];
        }
    });
    
    // Handle select option translations specifically
    const optionElements = document.querySelectorAll('option[data-translate]');
    optionElements.forEach(option => {
        const key = option.getAttribute('data-translate');
        if (translations[currentLanguage] && translations[currentLanguage][key]) {
            option.textContent = translations[currentLanguage][key];
        }
    });
}

function changeLanguage(lang) {
    setLanguage(lang);
}

function setLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    
    // Update dropdown selection
    const dropdown = document.getElementById('language-selector');
    if (dropdown) {
        dropdown.value = lang;
    }
    
    translatePage();
    
    // Force re-translate preview content if it's currently shown
    if (window.game && window.game.previewMode) {
        setTimeout(() => {
            window.game.updatePreview();
        }, 50);
    }
    
    // Re-translate any dynamic content that may not be caught by translatePage
    setTimeout(() => {
        // Force update all elements with data-translate attributes
        const allTranslateElements = document.querySelectorAll('[data-translate]');
        allTranslateElements.forEach(element => {
            const key = element.getAttribute('data-translate');
            if (key && translations[currentLanguage] && translations[currentLanguage][key]) {
                element.textContent = translations[currentLanguage][key];
            }
        });
        
        // Force update all placeholders
        const allPlaceholderElements = document.querySelectorAll('[data-translate-placeholder]');
        allPlaceholderElements.forEach(element => {
            const key = element.getAttribute('data-translate-placeholder');
            if (key && translations[currentLanguage] && translations[currentLanguage][key]) {
                element.placeholder = translations[currentLanguage][key];
            }
        });
        
        // Force update select options
        const allOptionElements = document.querySelectorAll('option[data-translate]');
        allOptionElements.forEach(option => {
            const key = option.getAttribute('data-translate');
            if (key && translations[currentLanguage] && translations[currentLanguage][key]) {
                option.textContent = translations[currentLanguage][key];
            }
        });
        
        // Update question counters
        const questionCounters = document.querySelectorAll('[id*="question-counter"]');
        questionCounters.forEach(counter => {
            const text = counter.textContent;
            const match = text.match(/(\d+).*?(\d+)/);
            if (match) {
                counter.textContent = getTranslation('question_x_of_y', match[1], match[2]);
            }
        });
        
        // Update any manual advance buttons
        const nextBtns = document.querySelectorAll('#next-question span[data-translate]');
        nextBtns.forEach(btn => {
            const key = btn.getAttribute('data-translate');
            if (key && translations[currentLanguage] && translations[currentLanguage][key]) {
                btn.textContent = translations[currentLanguage][key];
            }
        });
        
        // Force re-render preview if active
        if (window.game) {
            if (window.game.previewMode && window.game.updatePreview) {
                window.game.updatePreview();
            }
            if (window.game.splitPreviewActive && window.game.updateSplitPreview) {
                window.game.updateSplitPreview();
            }
        }
    }, 100);
}

class KahootGame {
    constructor() {
        // Get base path from <base> tag for Kubernetes path-based routing
        const basePath = document.querySelector('base')?.getAttribute('href') || '/';
        const cleanPath = basePath.replace(/\/$/, ''); // Remove trailing slash

        this.socket = io(window.location.origin, {
            path: cleanPath + '/socket.io',
            transports: ['websocket', 'polling'],
            timeout: 60000,
            forceNew: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            maxReconnectionDelay: 5000
        });
        this.currentScreen = 'main-menu';
        this.isHost = false;
        this.gamePin = null;
        this.questions = [];
        this.currentQuestion = 0;
        this.timer = null;
        
        this.initializeEventListeners();
        this.initializeSocketListeners();
        this.loadTheme();
        this.loadAutoSave();
        this.checkURLParameters();
        this.initializeSounds();
        this.mathJaxRenderTimeout = null;
        this.initializeQuestionElements();
        this.initializeLanguage();
    }

    initializeEventListeners() {
        document.getElementById('host-btn').addEventListener('click', () => {
            this.showScreen('host-screen');
        });
        document.getElementById('join-btn').addEventListener('click', () => this.showScreen('join-screen'));
        document.getElementById('browse-games').addEventListener('click', () => this.showGameBrowser());
        document.getElementById('refresh-games').addEventListener('click', () => this.refreshActiveGames());
        document.getElementById('back-to-join').addEventListener('click', () => this.showScreen('join-screen'));
        
        // Language selector event listeners
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                setLanguage(btn.getAttribute('data-lang'));
            });
        });
        
        document.getElementById('add-question').addEventListener('click', () => this.addQuestion());
        document.getElementById('save-quiz').addEventListener('click', () => this.saveQuiz());
        document.getElementById('load-quiz').addEventListener('click', () => this.showLoadQuizModal());
        document.getElementById('cancel-load').addEventListener('click', () => this.hideLoadQuizModal());
        document.getElementById('import-quiz').addEventListener('click', () => this.importQuiz());
        document.getElementById('import-file-input').addEventListener('change', (e) => this.handleFileImport(e));
        document.getElementById('preview-quiz').addEventListener('click', () => this.showQuizPreview());
        document.getElementById('cancel-preview').addEventListener('click', () => this.hideQuizPreview());
        document.getElementById('start-hosting').addEventListener('click', () => this.startHosting());
        document.getElementById('start-hosting-top').addEventListener('click', () => this.startHosting());
        document.getElementById('start-hosting-main')?.addEventListener('click', () => this.startHosting());
        document.getElementById('start-hosting-header-small')?.addEventListener('click', () => this.startHosting());
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('next-question').addEventListener('click', (e) => {
            console.log('Next question button clicked!');
            e.preventDefault();
            e.stopPropagation();
            this.nextQuestion();
        });
        
        document.getElementById('join-game').addEventListener('click', () => this.joinGame());
        document.getElementById('new-game').addEventListener('click', () => this.newGame());
        document.getElementById('play-again').addEventListener('click', () => this.newGame());
        
        // Auto-save on input changes
        document.getElementById('quiz-title').addEventListener('input', () => {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = setTimeout(() => this.autoSaveQuiz(), 1000);
        });
        
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        
        // Fullscreen toggle
        document.getElementById('fullscreen-toggle').addEventListener('click', () => this.toggleFullscreen());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        document.getElementById('player-multiple-choice').addEventListener('click', (e) => {
            if (e.target.classList.contains('player-option')) {
                this.submitAnswer(parseInt(e.target.dataset.option));
            }
        });

        document.getElementById('player-true-false').addEventListener('click', (e) => {
            if (e.target.classList.contains('tf-option')) {
                this.submitTrueFalseAnswer(e.target.dataset.answer);
            }
        });

        document.getElementById('submit-multiple').addEventListener('click', () => {
            this.submitMultipleCorrectAnswer();
        });

        document.getElementById('submit-numeric').addEventListener('click', () => {
            this.submitNumericAnswer();
        });

        // Add Enter key support for numeric input
        document.getElementById('numeric-answer-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submitNumericAnswer();
            }
        });
        
        // Toolbar event listeners
        this.setupToolbarListeners();
        
        // Back to top button
        this.setupBackToTopButton();
        
        // Preview settings
        this.setupPreviewSettings();
    }

    initializeSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server:', this.socket.id);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });

        this.socket.on('game-created', (data) => {
            this.gamePin = data.pin;
            this.isHost = true;
            document.getElementById('game-pin').textContent = data.pin;
            this.showScreen('game-lobby');
            this.loadQRCode(data.pin);
        });

        this.socket.on('player-joined', (data) => {
            this.gamePin = data.gamePin;
            document.getElementById('player-info').textContent = `${getTranslation('welcome')}, ${data.playerName}!`;
            this.showScreen('player-lobby');
        });

        this.socket.on('player-list-update', (data) => {
            this.updatePlayersList(data.players);
        });

        this.socket.on('game-starting', () => {
            if (this.isHost) {
                this.showScreen('host-game-screen');
            } else {
                this.showScreen('player-game-screen');
            }
        });

        this.socket.on('question-start', (data) => {
            if (data && typeof data === 'object') {
                // Switch host back to game screen from leaderboard
                if (this.isHost) {
                    this.showScreen('host-game-screen');
                    // Hide next question button since we're auto-advancing
                    const nextBtn = document.getElementById('next-question');
                    if (nextBtn) nextBtn.style.display = 'none';
                }
                
                this.displayQuestion(data);
                this.startTimer(data.timeLimit || 20);
                
                // Play question start sound
                this.playSound(800, 0.3);
            }
        });

        this.socket.on('question-end', (data) => {
            if (data && data.leaderboard) {
                this.showLeaderboard(data.leaderboard);
                if (this.isHost) {
                    const nextBtn = document.getElementById('next-question');
                    if (nextBtn) nextBtn.style.display = 'block';
                }
            }
        });

        this.socket.on('game-end', (data) => {
            console.log('Game ending received', data);
            // Clear any pending timers to prevent conflicts
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            
            if (data && data.finalLeaderboard) {
                // Add small delay to ensure all previous UI updates are complete
                setTimeout(() => {
                    this.showFinalResults(data.finalLeaderboard);
                }, 200);
            }
        });

        this.socket.on('answer-submitted', (data) => {
            this.showAnswerSubmitted(data.answer);
        });

        this.socket.on('question-timeout', (data) => {
            this.showCorrectAnswer(data);
        });

        this.socket.on('player-result', (data) => {
            this.showPlayerResult(data);
        });

        this.socket.on('error', (data) => {
            alert(data.message);
        });

        this.socket.on('game-ended', (data) => {
            alert(data.reason);
            this.newGame();
        });

        this.socket.on('answer-statistics', (data) => {
            this.updateAnswerStatistics(data);
        });

        this.socket.on('show-next-button', () => {
            console.log('Received show-next-button event');
            const nextButton = document.getElementById('next-question');
            console.log('Next button element:', nextButton);
            if (nextButton) {
                // Clear all existing styles that might interfere
                nextButton.removeAttribute('style');
                
                // Apply comprehensive styling
                nextButton.style.cssText = `
                    display: block !important;
                    position: fixed !important;
                    top: 100px !important;
                    right: 50px !important;
                    left: auto !important;
                    bottom: auto !important;
                    width: auto !important;
                    height: auto !important;
                    min-width: 180px !important;
                    min-height: 50px !important;
                    background-color: #e53e3e !important;
                    color: white !important;
                    font-size: 1.2rem !important;
                    font-weight: bold !important;
                    padding: 15px 25px !important;
                    border: 3px solid white !important;
                    border-radius: 8px !important;
                    cursor: pointer !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                    z-index: 99999 !important;
                    pointer-events: auto !important;
                    animation: pulse 2s infinite !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                    transform: none !important;
                `;
                nextButton.innerHTML = '⏭️ <span data-translate="next_question_manual">Next Question (Manual Control)</span>';
                
                // Add pulsing animation if not exists
                if (!document.getElementById('pulse-animation-style')) {
                    const style = document.createElement('style');
                    style.id = 'pulse-animation-style';
                    style.textContent = `
                        @keyframes pulse {
                            0% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                            100% { transform: scale(1); }
                        }
                    `;
                    document.head.appendChild(style);
                }
                
                // Apply translation if not English
                if (currentLanguage !== 'en') {
                    const span = nextButton.querySelector('span[data-translate]');
                    if (span && translations[currentLanguage] && translations[currentLanguage]['next_question_manual']) {
                        span.textContent = translations[currentLanguage]['next_question_manual'];
                    }
                }
                
                // Ensure the button is clickable by removing any pointer-events issues
                nextButton.style.pointerEvents = 'auto';
                
                // Add a click handler directly to be absolutely sure
                nextButton.onclick = () => {
                    console.log('Direct onclick handler triggered!');
                    this.nextQuestion();
                };
                
                console.log('Next button shown with manual styling');
                console.log('Button styles applied:', nextButton.style.cssText);
                console.log('Button position:', {
                    top: nextButton.offsetTop,
                    left: nextButton.offsetLeft,
                    width: nextButton.offsetWidth,
                    height: nextButton.offsetHeight,
                    display: nextButton.style.display,
                    visibility: getComputedStyle(nextButton).visibility
                });
                
                // Flash the button to make it more obvious
                let flashCount = 0;
                const flashInterval = setInterval(() => {
                    nextButton.style.backgroundColor = flashCount % 2 === 0 ? '#f56565' : '#e53e3e';
                    flashCount++;
                    if (flashCount > 6) {
                        clearInterval(flashInterval);
                        nextButton.style.backgroundColor = '#e53e3e';
                    }
                }, 300);
            } else {
                console.log('Next button not found!');
                const allButtons = document.querySelectorAll('button');
                console.log('All buttons found:', Array.from(allButtons).map(btn => btn.id || btn.className));
            }
        });

        this.socket.on('hide-next-button', () => {
            const nextButton = document.getElementById('next-question');
            if (nextButton) {
                nextButton.style.display = 'none';
            }
        });
    }

    showScreen(screenId) {
        // Clean up any active timers to prevent memory leaks
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        // Clear MathJax rendering timeout if switching screens
        if (this.mathJaxRenderTimeout) {
            clearTimeout(this.mathJaxRenderTimeout);
            this.mathJaxRenderTimeout = null;
        }
        
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;
        }
        
        // Show header start button only on host screen
        const headerStartBtn = document.getElementById('start-hosting-header-small');
        if (headerStartBtn) {
            headerStartBtn.style.display = screenId === 'host-screen' ? 'inline-flex' : 'none';
        }
        
        // Always translate page content after screen change
        setTimeout(() => translatePage(), 10);
    }

    addQuestion() {
        const questionsContainer = document.getElementById('questions-container');
        const questionCount = questionsContainer.children.length;
        
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        questionDiv.setAttribute('data-question', questionCount);
        
        // Auto-save when questions are modified
        setTimeout(() => this.autoSaveQuiz(), 100);
        
        questionDiv.innerHTML = `
            <h3>Question ${questionCount + 1}</h3>
            
            <div class="question-meta">
                <select class="question-type" onchange="updateQuestionType(this)">
                    <option value="multiple-choice">Multiple Choice</option>
                    <option value="multiple-correct">Multiple Correct Answers</option>
                    <option value="true-false">True/False</option>
                    <option value="numeric">Numeric Answer</option>
                </select>
                
                <select class="question-difficulty">
                    <option value="easy">Easy (100 pts)</option>
                    <option value="medium" selected>Medium (200 pts)</option>
                    <option value="hard">Hard (300 pts)</option>
                </select>
                
                <div class="time-limit-container">
                    <label>
                        Time (sec):
                        <input type="number" class="question-time-limit" min="5" max="300" value="20" onchange="updateTimeLimit(this)">
                    </label>
                </div>
            </div>
            
            <div class="question-content">
                <textarea class="question-text" placeholder="Enter your question (supports LaTeX: $x^2 + y^2 = z^2$)"></textarea>
                
                <div class="image-upload">
                    <label>Add Image (optional):</label>
                    <input type="file" class="image-input" accept="image/*" onchange="uploadImage(this)">
                    <div class="image-preview" style="display: none;">
                        <img class="question-image" src="" alt="Question Image" style="max-width: 200px; max-height: 150px;">
                        <button type="button" class="remove-image" onclick="removeImage(this)">Remove</button>
                    </div>
                </div>
            </div>
            
            <div class="answer-options multiple-choice-options">
                <div class="options">
                    <input type="text" class="option" data-option="0" placeholder="Option A">
                    <input type="text" class="option" data-option="1" placeholder="Option B">
                    <input type="text" class="option" data-option="2" placeholder="Option C">
                    <input type="text" class="option" data-option="3" placeholder="Option D">
                </div>
                <select class="correct-answer">
                    <option value="0">A is correct</option>
                    <option value="1">B is correct</option>
                    <option value="2">C is correct</option>
                    <option value="3">D is correct</option>
                </select>
            </div>
            
            <div class="answer-options multiple-correct-options" style="display: none;">
                <div class="options-checkboxes">
                    <label><input type="checkbox" class="correct-option" data-option="0"> <input type="text" class="option" placeholder="Option A"></label>
                    <label><input type="checkbox" class="correct-option" data-option="1"> <input type="text" class="option" placeholder="Option B"></label>
                    <label><input type="checkbox" class="correct-option" data-option="2"> <input type="text" class="option" placeholder="Option C"></label>
                    <label><input type="checkbox" class="correct-option" data-option="3"> <input type="text" class="option" placeholder="Option D"></label>
                </div>
            </div>
            
            <div class="answer-options true-false-options" style="display: none;">
                <select class="correct-answer">
                    <option value="true">True</option>
                    <option value="false">False</option>
                </select>
            </div>
            
            <div class="answer-options numeric-options" style="display: none;">
                <label>Correct Answer:</label>
                <input type="number" class="numeric-answer" placeholder="Enter numeric answer" step="any">
                <label>Tolerance (+/-):</label>
                <input type="number" class="numeric-tolerance" placeholder="0.1" step="any" value="0.1">
            </div>
            
            <button class="btn secondary remove-question" onclick="this.parentElement.remove()">Remove</button>
        `;
        
        questionsContainer.appendChild(questionDiv);
    }

    startHosting() {
        const title = document.getElementById('quiz-title').value.trim();
        if (!title) {
            showAlert('please_enter_quiz_title');
            return;
        }

        let questions = this.collectQuestions();
        if (questions.length === 0) {
            showAlert('please_add_one_question');
            return;
        }

        // Validate all questions have required content
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.question || q.question.trim() === '') {
                showAlert('question_missing_text', i + 1);
                return;
            }
            
            if (q.type === 'multiple-choice' || q.type === 'multiple-correct') {
                if (!q.options || q.options.filter(opt => opt && opt.trim()).length < 2) {
                    showAlert('question_needs_two_options', i + 1);
                    return;
                }
            }
        }

        // Check if questions should be randomized
        const shouldRandomizeQuestions = document.getElementById('randomize-questions').checked;
        if (shouldRandomizeQuestions) {
            questions = this.shuffleArray([...questions]);
        }

        // Check if answers should be randomized
        const shouldRandomizeAnswers = document.getElementById('randomize-answers').checked;
        if (shouldRandomizeAnswers) {
            questions = this.randomizeAnswers([...questions]);
        }

        // Check if manual advancement is enabled
        const manualAdvancement = document.getElementById('manual-advancement').checked;
        console.log('Manual advancement setting:', manualAdvancement);

        const quiz = {
            title: title,
            questions: questions,
            randomized: shouldRandomizeQuestions,
            answersRandomized: shouldRandomizeAnswers,
            manualAdvancement: manualAdvancement
        };

        this.socket.emit('host-join', { quiz });
    }

    collectQuestions() {
        const questions = [];
        const questionItems = document.querySelectorAll('.question-item');
        
        questionItems.forEach((item, index) => {
            const questionText = item.querySelector('.question-text').value.trim();
            const questionType = item.querySelector('.question-type').value;
            const questionDifficulty = item.querySelector('.question-difficulty').value;
            const imageElement = item.querySelector('.question-image');
            const imageUrl = imageElement ? (imageElement.dataset.url || '') : '';
            
            if (!questionText) return;
            
            // Get time limit for this question
            const timeLimitElement = item.querySelector('.question-time-limit');
            const useGlobalTime = document.getElementById('use-global-time').checked;
            const globalTimeLimit = parseInt(document.getElementById('global-time-limit').value) || 20;
            const individualTimeLimit = parseInt(timeLimitElement.value) || 20;
            
            let question = {
                question: questionText,
                type: questionType,
                difficulty: questionDifficulty,
                timeLimit: useGlobalTime ? globalTimeLimit : individualTimeLimit,
                image: imageUrl
            };
            
            switch (questionType) {
                case 'multiple-choice':
                    const mcOptions = Array.from(item.querySelectorAll('.multiple-choice-options .option')).map(opt => opt.value.trim());
                    const mcCorrect = parseInt(item.querySelector('.multiple-choice-options .correct-answer').value);
                    if (mcOptions.every(opt => opt)) {
                        question.options = mcOptions;
                        question.correctAnswer = mcCorrect;
                        questions.push(question);
                    }
                    break;
                    
                case 'multiple-correct':
                    const mcorrOptions = Array.from(item.querySelectorAll('.multiple-correct-options .option')).map(opt => opt.value.trim());
                    const mcorrCorrect = Array.from(item.querySelectorAll('.multiple-correct-options .correct-option:checked')).map(cb => parseInt(cb.dataset.option));
                    if (mcorrOptions.every(opt => opt) && mcorrCorrect.length > 0) {
                        question.options = mcorrOptions;
                        question.correctAnswers = mcorrCorrect;
                        questions.push(question);
                    }
                    break;
                    
                case 'true-false':
                    const tfCorrect = item.querySelector('.true-false-options .correct-answer').value;
                    question.options = [getTranslation('true_display'), getTranslation('false_display')]; // Display names
                    question.correctAnswer = tfCorrect; // Will be "true" or "false" (lowercase)
                    questions.push(question);
                    break;
                    
                case 'numeric':
                    const numAnswer = parseFloat(item.querySelector('.numeric-answer').value);
                    const numTolerance = parseFloat(item.querySelector('.numeric-tolerance').value) || 0.1;
                    if (!isNaN(numAnswer)) {
                        question.correctAnswer = numAnswer;
                        question.tolerance = numTolerance;
                        questions.push(question);
                    }
                    break;
            }
        });
        
        return questions;
    }

    joinGame() {
        const pin = document.getElementById('game-pin-input').value.trim();
        const name = document.getElementById('player-name').value.trim();
        
        if (!pin || !name) {
            showAlert('please_enter_pin_and_name');
            return;
        }
        
        if (pin.length !== 6 || !/^\d+$/.test(pin)) {
            showAlert('pin_must_be_six_digits');
            return;
        }
        
        if (name.length > 20) {
            showAlert('name_max_twenty_chars');
            return;
        }

        if (!this.socket.connected) {
            showAlert('not_connected_refresh');
            return;
        }

        this.socket.emit('player-join', { pin, name });
    }

    updatePlayersList(players) {
        const playersList = document.getElementById('players-list');
        playersList.innerHTML = '';
        
        players.forEach(player => {
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            playerCard.textContent = player.name;
            playersList.appendChild(playerCard);
        });
    }

    startGame() {
        this.socket.emit('start-game');
    }

    async loadQRCode(pin) {
        try {
            const response = await fetch(`api/qr/${pin}`);
            const data = await response.json();
            
            if (data.qrCode) {
                const qrImage = document.getElementById('qr-code-image');
                const qrLoading = document.querySelector('.qr-loading');
                const gameUrl = document.getElementById('game-url');
                
                qrImage.src = data.qrCode;
                qrImage.style.display = 'block';
                qrLoading.style.display = 'none';
                gameUrl.textContent = data.gameUrl;
            }
        } catch (error) {
            console.error('Failed to load QR code:', error);
            const qrLoading = document.querySelector('.qr-loading');
            setTranslatedText(qrLoading, 'failed_generate_qr_code');
        }
    }

    checkURLParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const pin = urlParams.get('pin');
        
        if (pin) {
            document.getElementById('game-pin-input').value = pin;
            this.showScreen('join-screen');
            
            // Show feedback that the PIN was detected from QR code
            const pinInput = document.getElementById('game-pin-input');
            const originalPlaceholder = pinInput.placeholder;
            pinInput.placeholder = `${getTranslation('pin_detected')}${pin}`;
            setTimeout(() => {
                pinInput.placeholder = originalPlaceholder;
            }, 3000);
            
            // Clear URL to avoid confusion
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    initializeSounds() {
        // Create AudioContext for sound effects
        this.audioContext = null;
        this.soundsEnabled = true;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
            this.soundsEnabled = false;
        }
    }

    initializeQuestionElements() {
        // Initialize dynamic question elements with proper default text
        // These elements should not be translated by the translation system
        const questionElements = [
            { id: 'current-question', defaultText: 'Question will appear here' },
            { id: 'player-question-text', defaultText: 'Question will appear here' },
            { id: 'preview-question-text', defaultText: 'Select a question to preview' },
            { id: 'preview-question-text-split', defaultText: 'Select a question to preview' }
        ];

        questionElements.forEach(({ id, defaultText }) => {
            const element = document.getElementById(id);
            if (element && !element.dataset.hasContent) {
                element.textContent = defaultText;
            }
        });
    }

    playSound(frequency, duration, type = 'sine') {
        if (!this.soundsEnabled || !this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            console.log('Sound playback failed:', e);
        }
    }

    displayQuestion(data) {
        if (this.isHost) {
            // Hide answer statistics during question
            this.hideAnswerStatistics();
            
            const questionCounter = document.getElementById('question-counter');
            const currentQuestion = document.getElementById('current-question');
            
            if (questionCounter) setTranslatedText(questionCounter, 'question_x_of_y', data.questionNumber, data.totalQuestions);
            if (currentQuestion) {
                currentQuestion.innerHTML = this.formatCodeBlocks(data.question);
                currentQuestion.dataset.hasContent = 'true'; // Mark as having dynamic content
                this.renderMathJax(currentQuestion);
            }
            
            if (data.image) {
                const imageDisplay = document.getElementById('question-image-display');
                const img = document.getElementById('host-question-image');
                if (imageDisplay && img) {
                    img.src = data.image;
                    imageDisplay.style.display = 'block';
                }
            } else {
                const imageDisplay = document.getElementById('question-image-display');
                if (imageDisplay) imageDisplay.style.display = 'none';
            }
            
            const optionsContainer = document.getElementById('answer-options');
            if (optionsContainer) {
                if (data.type === 'numeric') {
                    optionsContainer.style.display = 'none';
                } else {
                    // Clear any previous numeric answer displays
                    optionsContainer.innerHTML = `
                        <div class="option-display"></div>
                        <div class="option-display"></div>
                        <div class="option-display"></div>
                        <div class="option-display"></div>
                    `;
                    optionsContainer.style.display = 'grid';
                    const options = document.querySelectorAll('.option-display');
                    
                    // Reset all option styles from previous questions efficiently
                    this.resetButtonStyles(options);
                
                    if (data.type === 'true-false') {
                        setTranslatedText(options[0], 'true');
                        setTranslatedText(options[1], 'false');
                        options[2].style.display = 'none';
                        options[3].style.display = 'none';
                    } else {
                        options.forEach((option, index) => {
                            if (data.options && data.options[index]) {
                                const formattedOption = this.formatCodeBlocks(data.options[index]);
                                option.innerHTML = `${getOptionLetter(index)}: ${formattedOption}`;
                                option.style.display = 'block';
                                this.renderMathJax(option);
                            } else {
                                option.style.display = 'none';
                            }
                        });
                        
                        // Render LaTeX in answer options
                        this.renderMathJax();
                    }
                }
            }
            
            document.getElementById('next-question').style.display = 'none';
            
            this.renderMathJax(document.getElementById('current-question'));
        } else {
            setTranslatedText('player-question-counter', 'question_x_of_y', data.questionNumber, data.totalQuestions);
            
            // Display question text and image for players
            const playerQuestionText = document.getElementById('player-question-text');
            playerQuestionText.innerHTML = this.formatCodeBlocks(data.question);
            playerQuestionText.dataset.hasContent = 'true'; // Mark as having dynamic content
            this.renderMathJax(playerQuestionText);
            
            if (data.image) {
                const imageDisplay = document.getElementById('player-question-image');
                const img = document.getElementById('player-question-img');
                img.src = data.image;
                imageDisplay.style.display = 'block';
            } else {
                document.getElementById('player-question-image').style.display = 'none';
            }
            
            // Render LaTeX for players with retry mechanism and delay for DOM update
            setTimeout(() => {
                this.renderMathJax(document.getElementById('player-question-text'));
                // Also ensure global rendering for any options that get updated
                setTimeout(() => this.renderMathJax(), 100);
            }, 50);
            
            document.querySelectorAll('.player-answer-type').forEach(type => type.style.display = 'none');
            document.getElementById('answer-feedback').classList.add('hidden');
            
            // Reset result flag for new question
            this.resultShown = false;
            
            
            switch (data.type) {
                case 'multiple-choice':
                    document.getElementById('player-multiple-choice').style.display = 'block';
                    const mcOptions = document.querySelectorAll('#player-multiple-choice .player-option');
                    mcOptions.forEach((option, index) => {
                        if (data.options && data.options[index]) {
                            const formattedOption = this.formatCodeBlocks(data.options[index]);
                            option.innerHTML = `${getOptionLetter(index)}: ${formattedOption}`;
                            option.style.display = 'block';
                            this.renderMathJax(option);
                        } else {
                            option.style.display = 'none';
                        }
                        option.disabled = false;
                        // Reset any custom styling from previous questions efficiently
                        this.resetButtonStyles([option]);
                    });
                    
                    // Render LaTeX in answer options with delay
                    setTimeout(() => this.renderMathJax(), 100);
                    break;
                    
                case 'multiple-correct':
                    document.getElementById('player-multiple-correct').style.display = 'block';
                    const checkboxes = document.querySelectorAll('#player-multiple-correct .option-checkbox');
                    const checkboxLabels = document.querySelectorAll('#player-multiple-correct .checkbox-option');
                    
                    checkboxes.forEach(cb => cb.checked = false);
                    checkboxLabels.forEach((label, index) => {
                        if (data.options && data.options[index]) {
                            const formattedOption = this.formatCodeBlocks(data.options[index]);
                            label.innerHTML = `<input type="checkbox" class="option-checkbox"> ${getOptionLetter(index)}: ${formattedOption}`;
                            label.setAttribute('data-option', index);
                            this.renderMathJax(label);
                            label.style.display = 'flex';
                        } else {
                            label.style.display = 'none';
                        }
                    });
                    
                    // Render LaTeX in checkbox options with delay
                    setTimeout(() => this.renderMathJax(), 100);
                    
                    document.getElementById('submit-multiple').disabled = false;
                    break;
                    
                case 'true-false':
                    document.getElementById('player-true-false').style.display = 'block';
                    const tfOptions = document.querySelectorAll('.tf-option');
                    tfOptions.forEach(option => option.disabled = false);
                    // Reset any custom styling from previous questions efficiently
                    this.resetButtonStyles(tfOptions);
                    break;
                    
                case 'numeric':
                    document.getElementById('player-numeric').style.display = 'block';
                    document.getElementById('numeric-answer-input').value = '';
                    document.getElementById('numeric-answer-input').disabled = false;
                    document.getElementById('submit-numeric').disabled = false;
                    break;
            }
        }
    }

    startTimer(timeLimit) {
        if (this.timer) {
            clearInterval(this.timer);
        }
        
        let timeLeft = timeLimit;
        const timerElement = document.getElementById('timer');
        
        if (timerElement) {
            timerElement.textContent = timeLeft;
            timerElement.className = 'timer'; // Reset classes
            
            this.timer = setInterval(() => {
                timeLeft--;
                if (timerElement) {
                    timerElement.textContent = timeLeft;
                    
                    // Add visual pressure indicators
                    timerElement.className = 'timer';
                    if (timeLeft <= 5) {
                        timerElement.classList.add('critical');
                    } else if (timeLeft <= 10) {
                        timerElement.classList.add('warning');
                    }
                }
                
                if (timeLeft <= 0) {
                    clearInterval(this.timer);
                    this.timer = null;
                }
            }, 1000);
        }
    }

    submitAnswer(answer) {
        const options = document.querySelectorAll('.player-option');
        options.forEach(option => {
            option.disabled = true;
            option.classList.remove('selected');
        });
        
        if (options[answer]) {
            options[answer].classList.add('selected');
        }
        
        // Play submission sound
        this.playSound(600, 0.2);
        
        this.socket.emit('submit-answer', { answer });
    }

    submitTrueFalseAnswer(answer) {
        const tfOptions = document.querySelectorAll('.tf-option');
        tfOptions.forEach(option => {
            option.disabled = true;
            option.classList.remove('selected');
        });
        
        // Find and highlight the selected option
        const selectedOption = document.querySelector(`.tf-option[data-answer="${answer}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
        }
        
        // Play submission sound
        this.playSound(600, 0.2);
        
        this.socket.emit('submit-answer', { answer });
        this.showAnswerSubmitted(answer);
    }

    showAnswerSubmitted(answer) {
        const feedback = document.getElementById('answer-feedback');
        const message = document.getElementById('feedback-message');
        
        if (!feedback || !message) return;
        
        feedback.classList.remove('hidden', 'correct', 'incorrect');
        feedback.style.backgroundColor = '#3498db';
        
        let displayText = '';
        if (typeof answer === 'number') {
            // Check if this is a numeric input (decimal) or multiple choice index (integer)
            if (Number.isInteger(answer) && answer >= 0 && answer <= 3) {
                // Multiple choice answer - convert to letter
                const letter = String.fromCharCode(65 + answer);
                displayText = `Answer submitted: ${letter}`;
            } else {
                // Numeric input answer - show the actual number
                displayText = `Answer submitted: ${answer}`;
            }
        } else if (Array.isArray(answer)) {
            const letters = answer.map(a => String.fromCharCode(65 + a)).join(', ');
            displayText = `Answers submitted: ${letters}`;
        } else if (typeof answer === 'string') {
            displayText = `Answer submitted: ${answer.toUpperCase()}`;
        } else {
            displayText = `Answer submitted: ${answer}`;
        }
        
        message.textContent = displayText;
        setTranslatedText('score-display', 'waiting_for_results');
    }

    showCorrectAnswer(data) {
        if (this.isHost) {
            const questionType = data.questionType || 'multiple-choice';
            const options = document.querySelectorAll('.option-display');
            
            if (questionType === 'multiple-choice') {
                options.forEach((option, index) => {
                    if (index === data.correctAnswer) {
                        option.style.border = '5px solid #2ecc71';
                        option.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                        option.style.color = '#2ecc71';
                        option.style.fontWeight = 'bold';
                    }
                });
            } else if (questionType === 'true-false') {
                // For true-false, correctAnswer is a string ("true" or "false")
                // Convert to index: "true" = 0, "false" = 1
                const correctIndex = data.correctAnswer.toString().toLowerCase() === 'true' ? 0 : 1;
                options.forEach((option, index) => {
                    if (index === correctIndex) {
                        option.style.border = '5px solid #2ecc71';
                        option.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                        option.style.color = '#2ecc71';
                        option.style.fontWeight = 'bold';
                    }
                });
            } else if (questionType === 'multiple-correct') {
                if (Array.isArray(data.correctAnswer)) {
                    data.correctAnswer.forEach(correctIndex => {
                        if (options[correctIndex]) {
                            options[correctIndex].style.border = '5px solid #2ecc71';
                            options[correctIndex].style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                            options[correctIndex].style.color = '#2ecc71';
                            options[correctIndex].style.fontWeight = 'bold';
                        }
                    });
                }
            } else if (questionType === 'numeric') {
                // For numeric questions, show the correct answer in the question area
                this.showNumericCorrectAnswer(data.correctAnswer, data.tolerance);
            }
        } else {
            // Only highlight correct answer options temporarily, don't override player feedback
            const questionType = data.questionType || 'multiple-choice';
            if (questionType === 'multiple-choice') {
                const options = document.querySelectorAll('.player-option');
                if (options[data.correctAnswer]) {
                    options[data.correctAnswer].style.border = '5px solid #2ecc71';
                    // Remove highlighting after 3 seconds to prevent persistence
                    setTimeout(() => {
                        if (options[data.correctAnswer]) {
                            options[data.correctAnswer].style.border = '';
                        }
                    }, 3000);
                }
            } else if (questionType === 'true-false') {
                const tfOptions = document.querySelectorAll('.tf-option');
                tfOptions.forEach(option => {
                    if (option.dataset.answer === data.correctAnswer.toString().toLowerCase()) {
                        option.style.border = '5px solid #2ecc71';
                        // Remove highlighting after 3 seconds to prevent persistence
                        setTimeout(() => {
                            option.style.border = '';
                        }, 3000);
                    }
                });
            }
        }
    }

    showNumericCorrectAnswer(correctAnswer, tolerance) {
        if (!this.isHost) return;
        
        // Remove any existing correct answer display
        const existingAnswer = document.querySelector('.correct-answer-display');
        if (existingAnswer) {
            existingAnswer.remove();
        }
        
        // Show the answer in the options container for numeric questions
        const optionsContainer = document.getElementById('answer-options');
        if (optionsContainer) {
            optionsContainer.style.display = 'block';
            optionsContainer.innerHTML = `
                <div class="correct-answer-display numeric-answer-display">
                    <div class="correct-answer-banner">
                        <strong>✅ Correct Answer: ${correctAnswer}</strong>
                    </div>
                </div>
            `;
        }
    }

    nextQuestion() {
        console.log('nextQuestion() called - emitting next-question event');
        clearInterval(this.timer);
        this.socket.emit('next-question');
    }

    showLeaderboard(leaderboard) {
        this.updateLeaderboardDisplay(leaderboard);
        this.showScreen('leaderboard-screen');
        
        if (!this.isHost) {
            setTimeout(() => {
                this.showScreen('player-game-screen');
            }, 3000);
        }
    }

    showFinalResults(leaderboard) {
        this.updateLeaderboardDisplay(leaderboard);
        
        if (this.isHost) {
            // Host gets full celebration with confetti and sounds
            const finalResults = document.getElementById('final-results');
            finalResults.classList.remove('hidden');
            finalResults.classList.add('game-complete-animation');
            
            // Show confetti celebration
            this.showGameCompleteConfetti();
            
            // Play special game ending fanfare
            this.playGameEndingFanfare();
            
            this.showScreen('leaderboard-screen');
            
            // Remove animation class after animation completes
            setTimeout(() => {
                finalResults.classList.remove('game-complete-animation');
            }, 2000);
        } else {
            // Players get a dedicated final screen with special ending sound
            this.playGameEndingFanfare();
            this.showPlayerFinalScreen(leaderboard);
        }
    }

    showPlayerFinalScreen(leaderboard) {
        // Find player's position in the final leaderboard
        let playerPosition = -1;
        let playerScore = 0;
        
        // Get player's socket ID to find their position
        const playerId = this.socket.id;
        leaderboard.forEach((player, index) => {
            if (player.id === playerId) {
                playerPosition = index + 1;
                playerScore = player.score;
            }
        });
        
        // Update player's final rank display
        const positionElement = document.getElementById('final-position');
        const scoreElement = document.getElementById('final-score');
        
        if (positionElement) {
            positionElement.textContent = `#${playerPosition || 'N/A'}`;
            
            // Add special styling for top 3
            positionElement.className = 'final-position';
            if (playerPosition === 1) positionElement.classList.add('first-place');
            else if (playerPosition === 2) positionElement.classList.add('second-place');
            else if (playerPosition === 3) positionElement.classList.add('third-place');
        }
        
        if (scoreElement) {
            scoreElement.textContent = `${playerScore} ${getTranslation('points')}`;
        }
        
        // Show top 3 players
        this.updateFinalLeaderboard(leaderboard.slice(0, 3));
        
        // Add confetti celebration for all players
        this.showGameCompleteConfetti();
        
        this.showScreen('player-final-screen');
    }

    updateFinalLeaderboard(topPlayers) {
        const leaderboardContainer = document.getElementById('final-leaderboard');
        if (!leaderboardContainer) return;
        
        leaderboardContainer.innerHTML = '';
        
        topPlayers.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'final-leaderboard-item';
            
            const position = index + 1;
            const medal = ['🥇', '🥈', '🥉'][index] || '🏅';
            
            item.innerHTML = `
                <span class="medal">${medal}</span>
                <span class="player-name">${player.name}</span>
                <span class="player-score">${player.score} pts</span>
            `;
            
            if (position === 1) item.classList.add('first');
            else if (position === 2) item.classList.add('second');
            else if (position === 3) item.classList.add('third');
            
            leaderboardContainer.appendChild(item);
        });
    }

    updateLeaderboardDisplay(leaderboard) {
        const leaderboardList = document.getElementById('leaderboard-list');
        if (!leaderboardList) return;
        
        leaderboardList.innerHTML = '';
        
        leaderboard.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            if (index === 0) item.classList.add('first');
            else if (index === 1) item.classList.add('second');
            else if (index === 2) item.classList.add('third');
            
            const position = index + 1;
            const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
            
            item.innerHTML = `
                <span>${medal} ${player.name}</span>
                <span>${player.score} pts</span>
            `;
            
            leaderboardList.appendChild(item);
        });
    }

    submitMultipleCorrectAnswer() {
        const submitBtn = document.getElementById('submit-multiple');
        
        // Immediately disable button and provide visual feedback
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = getTranslation('submitting');
        }
        
        const checkboxes = document.querySelectorAll('#player-multiple-correct .option-checkbox:checked');
        const answers = Array.from(checkboxes).map(cb => {
            const closest = cb.closest('.checkbox-option');
            return closest ? parseInt(closest.dataset.option) : null;
        }).filter(option => option !== null);
        
        this.socket.emit('submit-answer', { answer: answers, type: 'multiple-correct' });
    }

    submitNumericAnswer() {
        const submitBtn = document.getElementById('submit-numeric');
        const input = document.getElementById('numeric-answer-input');
        
        const answer = parseFloat(input.value);
        if (isNaN(answer)) {
            showAlert('please_enter_valid_number');
            return;
        }
        
        // Immediately disable controls and provide visual feedback
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = getTranslation('submitting');
        }
        if (input) {
            input.disabled = true;
        }
        
        this.socket.emit('submit-answer', { answer: answer, type: 'numeric' });
        
        // Show immediate feedback and play sound like other answer types
        this.showAnswerSubmitted(answer);
        this.playSound('answerSubmit');
    }

    showPlayerResult(data) {
        // Prevent multiple result displays for the same question
        if (this.resultShown) {
            return;
        }
        this.resultShown = true;
        
        const feedback = document.getElementById('answer-feedback');
        const message = document.getElementById('feedback-message');
        const score = document.getElementById('score-display');
        
        feedback.classList.remove('hidden');
        
        if (data.isCorrect) {
            feedback.style.backgroundColor = '#2ecc71';
            message.textContent = '🎉 ' + getTranslation('correct_answer_msg');
            this.showConfetti();
            // Play success sound (ascending notes)
            setTimeout(() => this.playSound(523, 0.15), 0);   // C
            setTimeout(() => this.playSound(659, 0.15), 150); // E
            setTimeout(() => this.playSound(784, 0.3), 300);  // G
        } else {
            feedback.style.backgroundColor = '#e74c3c';
            message.textContent = '❌ ' + getTranslation('incorrect_answer_msg');
            // Play error sound (descending notes)
            this.playSound(400, 0.2, 'sawtooth');
            setTimeout(() => this.playSound(300, 0.3, 'sawtooth'), 200);
        }
        
        score.textContent = `+${data.points} points (Total: ${data.totalScore})`;
    }

    showConfetti() {
        if (typeof confetti !== 'undefined') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#ff6b35', '#4ecdc4', '#45b7aa', '#ffd700', '#2ecc71']
            });
        }
    }

    renderMathJax(element) {
        if (!element) return;
        
        // Add processing class to prevent flash
        element.classList.add('processing-math');
        
        const tryRender = (attempt = 0) => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                // Clear any existing MathJax content in the element first
                const mathJaxElements = element.querySelectorAll('.MathJax, .mjx-container');
                mathJaxElements.forEach(el => el.remove());
                
                // Use a more robust rendering approach
                MathJax.typesetPromise([element]).then(() => {
                    // Ensure proper display after rendering
                    const containers = element.querySelectorAll('.mjx-container');
                    containers.forEach(container => {
                        container.style.display = 'inline-block';
                        container.style.verticalAlign = 'middle';
                        container.classList.add('MathJax_Processed');
                    });
                    
                    // Remove processing class and show content
                    element.classList.remove('processing-math');
                    element.classList.add('math-ready');
                }).catch(err => {
                    console.warn('MathJax rendering failed:', err);
                    // Remove processing class even on error
                    element.classList.remove('processing-math');
                    element.classList.add('math-ready');
                    
                    // Fallback: try global typeset if element-specific fails
                    MathJax.typesetPromise().catch(globalErr => {
                        console.warn('Global MathJax rendering also failed:', globalErr);
                    });
                });
            } else if (attempt < 10) {
                setTimeout(() => tryRender(attempt + 1), 100);
            } else {
                console.warn('MathJax not available after 1 second');
                // Remove processing class if MathJax never loads
                element.classList.remove('processing-math');
                element.classList.add('math-ready');
            }
        };
        
        tryRender();
    }

    // Code formatting helper
    formatCodeBlocks(text) {
        if (!text) return text;
        
        // Convert code blocks (```language ... ```)
        text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || 'text';
            const trimmedCode = code.trim();
            return `<pre><code class="language-${lang}">${this.escapeHtml(trimmedCode)}</code></pre>`;
        });
        
        // Convert inline code (`code`)
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        return text;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Process both code formatting and MathJax
    processContentFormatting(element) {
        if (!element) return;
        
        // First, format code blocks
        element.innerHTML = this.formatCodeBlocks(element.innerHTML);
        
        // Then render MathJax
        this.renderMathJax(element);
    }
    
    setupToolbarListeners() {
        // Toolbar button listeners
        document.getElementById('toolbar-add-question')?.addEventListener('click', () => this.addQuestion());
        document.getElementById('toolbar-save')?.addEventListener('click', () => this.saveQuiz());
        document.getElementById('toolbar-load')?.addEventListener('click', () => this.showLoadQuizModal());
        document.getElementById('toolbar-ai-gen')?.addEventListener('click', () => openAIGeneratorModal());
        document.getElementById('toolbar-preview')?.addEventListener('click', () => togglePreviewMode());
        document.getElementById('toolbar-import')?.addEventListener('click', () => this.importQuiz());
        document.getElementById('toolbar-top')?.addEventListener('click', () => this.scrollToTop());
        document.getElementById('toolbar-bottom')?.addEventListener('click', () => this.scrollToBottom());
        document.getElementById('toolbar-collapse')?.addEventListener('click', () => toggleToolbarCollapse());
        document.getElementById('toolbar-preview-settings')?.addEventListener('click', () => openPreviewSettings());
        
        // Initialize toolbar state from localStorage
        this.initializeToolbarState();
    }
    
    setupBackToTopButton() {
        const backToTopBtn = document.getElementById('back-to-top');
        const editorSection = document.getElementById('quiz-editor-section');
        
        if (!backToTopBtn || !editorSection) return;
        
        // Show/hide back to top button based on scroll position
        editorSection.addEventListener('scroll', () => {
            if (editorSection.scrollTop > 300) {
                backToTopBtn.style.display = 'block';
            } else {
                backToTopBtn.style.display = 'none';
            }
        });
        
        // Back to top button click
        backToTopBtn.addEventListener('click', () => this.scrollToTop());
    }
    
    initializeToolbarState() {
        const toolbarVisible = localStorage.getItem('toolbarVisible');
        const toolbarCollapsed = localStorage.getItem('toolbarCollapsed');
        const hostScreen = document.getElementById('host-screen');
        const toolbar = document.getElementById('left-toolbar');
        
        // Show toolbar by default on desktop, hide on mobile
        const isDesktop = window.innerWidth > 1024;
        
        if (toolbarVisible === 'false' || !isDesktop) {
            toolbar.style.display = 'none';
        } else {
            toolbar.style.display = 'block';
            hostScreen.classList.add('with-toolbar');
            
            if (toolbarCollapsed === 'true') {
                toolbar.classList.add('collapsed');
                hostScreen.classList.add('collapsed');
            }
        }
    }
    
    scrollToTop() {
        // Only work when live preview is active
        if (!isPreviewMode) {
            showAlert('scroll_shortcuts_only_when_preview');
            return;
        }
        
        const editorSection = document.getElementById('quiz-editor-section');
        if (editorSection) {
            editorSection.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
    
    scrollToBottom() {
        // Only work when live preview is active
        if (!isPreviewMode) {
            showAlert('scroll_shortcuts_only_when_preview');
            return;
        }
        
        const editorSection = document.getElementById('quiz-editor-section');
        if (editorSection) {
            editorSection.scrollTo({ top: editorSection.scrollHeight, behavior: 'smooth' });
        }
    }
    
    setupPreviewSettings() {
        // Close settings sidebar listener
        document.getElementById('close-preview-settings')?.addEventListener('click', () => {
            this.closePreviewSettings();
        });
        
        // Reset settings listener
        document.getElementById('reset-preview-settings')?.addEventListener('click', () => {
            this.resetPreviewSettings();
        });
        
        // Real-time slider listeners
        this.setupSliderListeners();
        
        // Load saved settings on startup
        this.loadPreviewSettings();
    }
    
    setupSliderListeners() {
        const sliders = {
            'split-ratio-slider': (value) => this.updateSplitRatio(parseFloat(value)),
            'font-size-slider': (value) => this.updateFontSize(parseFloat(value)),
            'spacing-slider': (value) => this.updateSpacing(parseFloat(value)),
            'button-size-slider': (value) => this.updateButtonSize(parseFloat(value))
        };
        
        Object.entries(sliders).forEach(([sliderId, callback]) => {
            const slider = document.getElementById(sliderId);
            if (slider) {
                // Real-time updates on input
                slider.addEventListener('input', (e) => {
                    callback(e.target.value);
                    this.saveCurrentSettings();
                });
                
                // Also update on change for accessibility
                slider.addEventListener('change', (e) => {
                    callback(e.target.value);
                    this.saveCurrentSettings();
                });
            }
        });
    }
    
    updateSplitRatio(value) {
        const left = value;
        const right = 100 - value;
        
        document.documentElement.style.setProperty('--split-left', `${left}%`);
        document.documentElement.style.setProperty('--split-right', `${right}%`);
        
        const valueDisplay = document.getElementById('split-ratio-value');
        if (valueDisplay) {
            valueDisplay.textContent = `${left}% / ${right}%`;
        }
    }
    
    updateFontSize(multiplier) {
        const root = document.documentElement;
        
        root.style.setProperty('--preview-font-base', `${multiplier}em`);
        root.style.setProperty('--preview-font-question', `${multiplier * 1.1}em`);
        root.style.setProperty('--preview-font-option', `${multiplier * 0.95}rem`);
        root.style.setProperty('--preview-font-small', `${multiplier * 0.7}rem`);
        
        const valueDisplay = document.getElementById('font-size-value');
        if (valueDisplay) {
            valueDisplay.textContent = `${multiplier.toFixed(1)}x`;
        }
    }
    
    updateSpacing(multiplier) {
        const baseSpacing = 8; // Base spacing in pixels
        const spacing = Math.round(baseSpacing * multiplier);
        const spacingSmall = Math.round(spacing * 0.5);
        const spacingLarge = Math.round(spacing * 1.5);
        
        const root = document.documentElement;
        root.style.setProperty('--preview-spacing', `${spacing}px`);
        root.style.setProperty('--preview-spacing-small', `${spacingSmall}px`);
        root.style.setProperty('--preview-spacing-large', `${spacingLarge}px`);
        
        const valueDisplay = document.getElementById('spacing-value');
        if (valueDisplay) {
            const labels = { 0.5: 'Minimal', 1.0: 'Normal', 1.5: 'Comfortable', 2.0: 'Spacious' };
            const closest = Object.keys(labels).reduce((prev, curr) => 
                Math.abs(curr - multiplier) < Math.abs(prev - multiplier) ? curr : prev
            );
            valueDisplay.textContent = labels[closest] || `${multiplier.toFixed(1)}x`;
        }
    }
    
    updateButtonSize(multiplier) {
        const basePadding = 8;
        const baseHeight = 40;
        
        const padding = Math.round(basePadding * multiplier);
        const height = Math.round(baseHeight * multiplier);
        
        const root = document.documentElement;
        root.style.setProperty('--preview-button-padding', `${padding}px ${padding + 4}px`);
        root.style.setProperty('--preview-button-height', `${height}px`);
        
        const valueDisplay = document.getElementById('button-size-value');
        if (valueDisplay) {
            const labels = { 0.7: 'Small', 1.0: 'Normal', 1.3: 'Large', 1.5: 'Extra Large' };
            const closest = Object.keys(labels).reduce((prev, curr) => 
                Math.abs(curr - multiplier) < Math.abs(prev - multiplier) ? curr : prev
            );
            valueDisplay.textContent = labels[closest] || `${multiplier.toFixed(1)}x`;
        }
    }
    
    // Removed updateDensity function - density slider removed
    
    saveCurrentSettings() {
        const settings = {
            splitRatio: document.getElementById('split-ratio-slider')?.value || 50,
            fontSize: document.getElementById('font-size-slider')?.value || 1.0,
            spacing: document.getElementById('spacing-slider')?.value || 1.0,
            buttonSize: document.getElementById('button-size-slider')?.value || 1.0
        };
        
        localStorage.setItem('previewSettings', JSON.stringify(settings));
    }
    
    loadPreviewSettings() {
        const settings = JSON.parse(localStorage.getItem('previewSettings') || '{}');
        
        // Apply saved settings or defaults
        const splitRatio = parseFloat(settings.splitRatio) || 50;
        const fontSize = parseFloat(settings.fontSize) || 1.0;
        const spacing = parseFloat(settings.spacing) || 1.0;
        const buttonSize = parseFloat(settings.buttonSize) || 1.0;
        
        // Update sliders
        const splitSlider = document.getElementById('split-ratio-slider');
        const fontSlider = document.getElementById('font-size-slider');
        const spacingSlider = document.getElementById('spacing-slider');
        const buttonSlider = document.getElementById('button-size-slider');
        
        if (splitSlider) splitSlider.value = splitRatio;
        if (fontSlider) fontSlider.value = fontSize;
        if (spacingSlider) spacingSlider.value = spacing;
        if (buttonSlider) buttonSlider.value = buttonSize;
        
        // Apply settings
        this.updateSplitRatio(splitRatio);
        this.updateFontSize(fontSize);
        this.updateSpacing(spacing);
        this.updateButtonSize(buttonSize);
    }
    
    // Removed applyPreviewSettings - now using real-time updates
    
    // Removed updateCSSVariables - now using individual update methods
    
    resetPreviewSettings() {
        // Reset sliders to defaults
        const splitSlider = document.getElementById('split-ratio-slider');
        const fontSlider = document.getElementById('font-size-slider');
        const spacingSlider = document.getElementById('spacing-slider');
        const buttonSlider = document.getElementById('button-size-slider');
        
        if (splitSlider) splitSlider.value = 50;
        if (fontSlider) fontSlider.value = 1.0;
        if (spacingSlider) spacingSlider.value = 1.0;
        if (buttonSlider) buttonSlider.value = 1.0;
        
        // Apply defaults
        this.updateSplitRatio(50);
        this.updateFontSize(1.0);
        this.updateSpacing(1.0);
        this.updateButtonSize(1.0);
        
        // Clear localStorage
        localStorage.removeItem('previewSettings');
    }
    
    closePreviewSettings() {
        document.getElementById('preview-settings-sidebar').style.display = 'none';
    }

    newGame() {
        // Clean up any timers before reloading
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        // Clean up MathJax rendering timeout
        if (this.mathJaxRenderTimeout) {
            clearTimeout(this.mathJaxRenderTimeout);
            this.mathJaxRenderTimeout = null;
        }
        
        // Clean up auto-save timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
        
        // Reset game state
        this.isHost = false;
        this.gamePin = null;
        this.currentQuestion = 0;
        
        location.reload();
    }
    
    autoSaveQuiz() {
        try {
            const title = document.getElementById('quiz-title').value.trim();
            const questions = this.collectQuestions();
            
            if (title || questions.length > 0) {
                const autosave = {
                    title,
                    questions,
                    timestamp: Date.now()
                };
                localStorage.setItem('quizmaster_autosave', JSON.stringify(autosave));
            }
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }
    
    loadAutoSave() {
        try {
            const autosave = localStorage.getItem('quizmaster_autosave');
            if (autosave) {
                const data = JSON.parse(autosave);
                // Only load if it's recent (within 24 hours)
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    if (showConfirm('restore_autosave_confirm')) {
                        document.getElementById('quiz-title').value = data.title || '';
                        
                        // Clear existing questions
                        document.getElementById('questions-container').innerHTML = '';
                        
                        // Load questions
                        if (data.questions && data.questions.length > 0) {
                            data.questions.forEach((question, index) => {
                                this.addQuestion();
                                this.populateQuestion(index, question);
                            });
                        } else {
                            this.addQuestion(); // Add at least one question
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load auto-save:', error);
        }
    }
    
    clearAutoSave() {
        localStorage.removeItem('quizmaster_autosave');
    }
    
    showQuizPreview() {
        const title = document.getElementById('quiz-title').value.trim();
        const questions = this.collectQuestions();
        
        if (questions.length === 0) {
            showAlert('please_add_question_to_preview');
            return;
        }
        
        const previewContent = document.getElementById('preview-content');
        let html = `<h4>${title || 'Untitled Quiz'}</h4>`;
        html += `<p><strong>Total Questions:</strong> ${questions.length}</p><hr>`;
        
        questions.forEach((q, index) => {
            html += `<div class="preview-question">`;
            html += `<h5>Question ${index + 1}</h5>`;
            html += `<p><strong>Type:</strong> ${q.type.replace('-', ' ')}</p>`;
            html += `<p><strong>Question:</strong> ${q.question}</p>`;
            
            if (q.type === 'multiple-choice') {
                html += `<p><strong>Options:</strong></p><ul>`;
                q.options.forEach((opt, i) => {
                    const isCorrect = q.correctAnswer === i;
                    html += `<li${isCorrect ? ' style="color: green; font-weight: bold;"' : ''}>${String.fromCharCode(65 + i)}: ${opt}${isCorrect ? ' ✓' : ''}</li>`;
                });
                html += `</ul>`;
            } else if (q.type === 'true-false') {
                html += `<p><strong>Correct Answer:</strong> <span style="color: green; font-weight: bold;">${q.correctAnswer}</span></p>`;
            } else if (q.type === 'numeric') {
                html += `<p><strong>Correct Answer:</strong> <span style="color: green; font-weight: bold;">${q.correctAnswer} (±${q.tolerance})</span></p>`;
            }
            
            if (q.image) {
                html += `<p><strong>Image:</strong> Yes</p>`;
            }
            
            html += `</div><hr>`;
        });
        
        previewContent.innerHTML = html;
        document.getElementById('quiz-preview-modal').style.display = 'flex';
    }
    
    hideQuizPreview() {
        document.getElementById('quiz-preview-modal').style.display = 'none';
    }
    
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    
    randomizeAnswers(questions) {
        return questions.map(question => {
            // Only randomize multiple-choice and multiple-correct questions
            if (question.type === 'multiple-choice' || question.type === 'multiple-correct') {
                if (!question.options || question.options.length < 2) {
                    return question; // Skip if not enough options
                }
                
                // Create array of indices and shuffle them
                const indices = question.options.map((_, index) => index);
                const shuffledIndices = this.shuffleArray(indices);
                
                // Create new options array based on shuffled indices
                const newOptions = shuffledIndices.map(oldIndex => question.options[oldIndex]);
                
                // Update correct answer mapping
                const newQuestion = { ...question, options: newOptions };
                
                if (question.type === 'multiple-choice') {
                    // Find where the original correct answer ended up
                    const oldCorrectIndex = question.correctAnswer;
                    const newCorrectIndex = shuffledIndices.indexOf(oldCorrectIndex);
                    newQuestion.correctAnswer = newCorrectIndex;
                } else if (question.type === 'multiple-correct') {
                    // Map all correct answer indices to their new positions
                    const oldCorrectAnswers = question.correctAnswers || [];
                    const newCorrectAnswers = oldCorrectAnswers.map(oldIndex => 
                        shuffledIndices.indexOf(oldIndex)
                    ).sort();
                    newQuestion.correctAnswers = newCorrectAnswers;
                }
                
                return newQuestion;
            }
            
            // Return unchanged for true-false and numeric questions
            return question;
        });
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        
        // Update button icon
        const toggleBtn = document.getElementById('theme-toggle');
        toggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        
        // Save preference
        localStorage.setItem('theme', newTheme);
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
        }
    }
    
    handleKeyboardShortcuts(e) {
        // Only handle shortcuts on host screen
        if (this.currentScreen !== 'host-screen') return;
        
        // Ctrl/Cmd + key combinations
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'q':
                    e.preventDefault();
                    this.addQuestion();
                    break;
                case 's':
                    e.preventDefault();
                    this.saveQuiz();
                    break;
                case 'o':
                    e.preventDefault();
                    this.showLoadQuizModal();
                    break;
                case 'p':
                    e.preventDefault();
                    this.showQuizPreview();
                    break;
                case 'enter':
                    e.preventDefault();
                    this.startHosting();
                    break;
                case 'b':
                    e.preventDefault();
                    toggleToolbar();
                    break;
                case ',':
                    e.preventDefault();
                    openPreviewSettings();
                    break;
            }
        }
        
        // Other shortcuts
        if (e.key === 'Home' && e.ctrlKey) {
            e.preventDefault();
            this.scrollToTop();
        }
        if (e.key === 'End' && e.ctrlKey) {
            e.preventDefault();
            this.scrollToBottom();
        }
        
        // Close modals with Escape
        if (e.key === 'Escape') {
            const previewSidebar = document.getElementById('preview-settings-sidebar');
            const aiModal = document.getElementById('ai-generator-modal');
            
            if (previewSidebar && previewSidebar.style.display !== 'none') {
                this.closePreviewSettings();
            } else if (aiModal && aiModal.style.display !== 'none') {
                closeAIGeneratorModal();
            }
        }
        
        // F11 for fullscreen
        if (e.key === 'F11') {
            e.preventDefault();
            this.toggleFullscreen();
        }
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    importQuiz() {
        document.getElementById('import-file-input').click();
    }
    
    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                let quizData;
                
                if (file.name.endsWith('.json')) {
                    quizData = JSON.parse(e.target.result);
                } else if (file.name.endsWith('.csv')) {
                    quizData = this.parseCSV(e.target.result);
                } else {
                    showAlert('please_select_csv_json');
                    return;
                }
                
                if (quizData && quizData.questions && Array.isArray(quizData.questions)) {
                    this.loadImportedQuiz(quizData);
                } else {
                    showAlert('invalid_file_format');
                }
            } catch (error) {
                console.error('Import error:', error);
                showAlert('error_importing_file');
            }
        };
        
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }
    
    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) throw new Error('CSV must have header and at least one data row');
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const questions = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const question = {
                type: 'multiple-choice',
                difficulty: 'medium',
                timeLimit: 20
            };
            
            headers.forEach((header, index) => {
                const value = values[index] || '';
                switch (header) {
                    case 'question':
                        question.question = value;
                        break;
                    case 'type':
                        question.type = value || 'multiple-choice';
                        break;
                    case 'difficulty':
                        question.difficulty = value || 'medium';
                        break;
                    case 'option_a':
                    case 'option_b':
                    case 'option_c':
                    case 'option_d':
                        if (!question.options) question.options = [];
                        question.options.push(value);
                        break;
                    case 'correct_answer':
                        if (question.type === 'multiple-choice') {
                            question.correctAnswer = parseInt(value) || 0;
                        } else {
                            question.correctAnswer = value;
                        }
                        break;
                }
            });
            
            if (question.question) {
                questions.push(question);
            }
        }
        
        return {
            title: getTranslation('imported_quiz'),
            questions: questions
        };
    }
    
    loadImportedQuiz(quizData) {
        if (showConfirm('import_quiz_confirm', quizData.title || getTranslation('untitled_quiz'), quizData.questions.length)) {
            // Clear existing questions
            document.getElementById('questions-container').innerHTML = '';
            document.getElementById('quiz-title').value = quizData.title || 'Imported Quiz';
            
            // Add each question
            quizData.questions.forEach((question, index) => {
                this.addQuestion();
                this.populateQuestion(index, question);
            });
            
            showAlert('successfully_imported_questions', quizData.questions.length);
        }
    }
    
    async saveQuiz() {
        const title = document.getElementById('quiz-title').value.trim();
        if (!title) {
            showAlert('please_enter_quiz_title');
            return;
        }
        
        const questions = this.collectQuestions();
        if (questions.length === 0) {
            showAlert('please_add_one_question');
            return;
        }
        
        try {
            const response = await fetch('api/save-quiz', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, questions })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            showAlert('quiz_saved_successfully', result.filename);
        } catch (error) {
            console.error('Save quiz error:', error);
            showAlert('failed_save_quiz');
        }
    }
    
    async showLoadQuizModal() {
        try {
            const response = await fetch('api/quizzes');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const quizzes = await response.json();
            const quizList = document.getElementById('quiz-list');
            
            if (quizzes.length === 0) {
                quizList.innerHTML = '<p>No saved quizzes found.</p>';
            } else {
                quizList.innerHTML = quizzes.map(quiz => `
                    <div class="quiz-item" onclick="window.game.loadQuiz('${quiz.filename}')">
                        <h4>${quiz.title}</h4>
                        <p>${quiz.questionCount} questions</p>
                        <small>Created: ${new Date(quiz.created).toLocaleDateString()}</small>
                    </div>
                `).join('');
            }
            
            document.getElementById('load-quiz-modal').style.display = 'flex';
        } catch (error) {
            console.error('Load quizzes error:', error);
            showAlert('failed_load_quiz_list');
        }
    }
    
    hideLoadQuizModal() {
        document.getElementById('load-quiz-modal').style.display = 'none';
    }
    
    async loadQuiz(filename) {
        try {
            const response = await fetch(`api/quiz/${filename}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const quiz = await response.json();
            
            // Clear existing questions
            document.getElementById('questions-container').innerHTML = '';
            
            // Set quiz title
            document.getElementById('quiz-title').value = quiz.title;
            
            // Add each question
            quiz.questions.forEach((question, index) => {
                this.addQuestion();
                this.populateQuestion(index, question);
            });
            
            this.hideLoadQuizModal();
            showAlert('quiz_loaded_successfully', quiz.title);
        } catch (error) {
            console.error('Load quiz error:', error);
            showAlert('failed_load_quiz');
        }
    }
    
    populateQuestion(index, questionData) {
        const questionItem = document.querySelectorAll('.question-item')[index];
        if (!questionItem) return;
        
        questionItem.querySelector('.question-text').value = questionData.question;
        questionItem.querySelector('.question-type').value = questionData.type || 'multiple-choice';
        
        // Update question type UI
        updateQuestionType(questionItem.querySelector('.question-type'));
        
        // Set options based on question type
        switch (questionData.type || 'multiple-choice') {
            case 'multiple-choice':
                if (questionData.options) {
                    questionData.options.forEach((option, optIndex) => {
                        const optionInput = questionItem.querySelector(`[data-option="${optIndex}"]`);
                        if (optionInput) optionInput.value = option;
                    });
                }
                if (questionData.correctAnswer !== undefined) {
                    questionItem.querySelector('.correct-answer').value = questionData.correctAnswer;
                }
                break;
                
            case 'multiple-correct':
                if (questionData.options) {
                    const labels = questionItem.querySelectorAll(`.multiple-correct-options label`);
                    questionData.options.forEach((option, optIndex) => {
                        if (labels[optIndex]) {
                            const optionInput = labels[optIndex].querySelector('.option');
                            if (optionInput) optionInput.value = option;
                        }
                    });
                }
                if (questionData.correctAnswers && Array.isArray(questionData.correctAnswers)) {
                    questionData.correctAnswers.forEach(correctIndex => {
                        const checkbox = questionItem.querySelector(`.multiple-correct-options .correct-option[data-option="${correctIndex}"]`);
                        if (checkbox) checkbox.checked = true;
                    });
                }
                break;
                
            case 'true-false':
                if (questionData.correctAnswer !== undefined) {
                    // Normalize the value to lowercase to handle case sensitivity
                    const normalizedAnswer = questionData.correctAnswer.toString().toLowerCase();
                    // Use setTimeout to ensure the dropdown is visible after updateQuestionType
                    setTimeout(() => {
                        const dropdown = questionItem.querySelector('.true-false-options .correct-answer');
                        if (dropdown) {
                            dropdown.value = normalizedAnswer;
                        }
                    }, 10);
                }
                break;
                
            case 'numeric':
                if (questionData.correctAnswer !== undefined) {
                    questionItem.querySelector('.numeric-answer').value = questionData.correctAnswer;
                }
                if (questionData.tolerance !== undefined) {
                    questionItem.querySelector('.numeric-tolerance').value = questionData.tolerance;
                }
                break;
        }
        
        // Set image if present
        if (questionData.image) {
            const img = questionItem.querySelector('.question-image');
            const preview = questionItem.querySelector('.image-preview');
            if (img && preview) {
                img.src = questionData.image;
                img.dataset.url = questionData.image;
                preview.style.display = 'block';
            }
        }
    }

    showGameCompleteConfetti() {
        if (window.confetti) {
            // Optimized confetti with timed bursts instead of continuous animation
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
            
            // Initial big burst
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: colors
            });
            
            // Side bursts with reduced frequency and particles
            const burstTimes = [300, 600, 900, 1200, 1500];
            burstTimes.forEach(time => {
                setTimeout(() => {
                    confetti({
                        particleCount: 30,
                        angle: 60,
                        spread: 45,
                        origin: { x: 0, y: 0.7 },
                        colors: colors
                    });
                    confetti({
                        particleCount: 30,
                        angle: 120,
                        spread: 45,
                        origin: { x: 1, y: 0.7 },
                        colors: colors
                    });
                }, time);
            });
            
            // Final central burst
            setTimeout(() => {
                confetti({
                    particleCount: 60,
                    spread: 60,
                    origin: { y: 0.5 },
                    colors: colors
                });
            }, 2000);
        }
    }

    playVictorySound() {
        if (!this.soundsEnabled || !this.audioContext) return;
        
        try {
            // Play a victory melody
            const notes = [
                { freq: 523, time: 0 },     // C
                { freq: 659, time: 0.15 },  // E
                { freq: 784, time: 0.3 },   // G
                { freq: 1047, time: 0.45 }, // C (higher)
                { freq: 784, time: 0.6 },   // G
                { freq: 1047, time: 0.75 }  // C (higher)
            ];
            
            notes.forEach(note => {
                setTimeout(() => {
                    this.playSound(note.freq, 0.2);
                }, note.time * 1000);
            });
        } catch (e) {
            console.log('Victory sound playback failed:', e);
        }
    }

    playGameEndingFanfare() {
        if (!this.soundsEnabled || !this.audioContext) return;
        
        try {
            // Play an elaborate game ending fanfare (triumph-like melody)
            const fanfareNotes = [
                // Opening triumphant notes
                { freq: 523, time: 0, duration: 0.3 },     // C
                { freq: 659, time: 0.1, duration: 0.3 },   // E
                { freq: 784, time: 0.2, duration: 0.3 },   // G
                { freq: 1047, time: 0.3, duration: 0.4 },  // C (higher)
                
                // Rising sequence
                { freq: 659, time: 0.8, duration: 0.2 },   // E
                { freq: 784, time: 1.0, duration: 0.2 },   // G
                { freq: 1047, time: 1.2, duration: 0.2 },  // C
                { freq: 1319, time: 1.4, duration: 0.4 },  // E (higher)
                
                // Grand finale
                { freq: 1047, time: 2.0, duration: 0.3 },  // C
                { freq: 1319, time: 2.2, duration: 0.3 },  // E
                { freq: 1568, time: 2.4, duration: 0.6 },  // G (highest)
                { freq: 2093, time: 2.8, duration: 0.8 }   // C (very high)
            ];
            
            fanfareNotes.forEach(note => {
                setTimeout(() => {
                    this.playSound(note.freq, note.duration, 'triangle');
                }, note.time * 1000);
            });
            
            // Add some harmonic accompaniment
            setTimeout(() => {
                this.playSound(523, 1.5, 'sawtooth'); // Bass C
                setTimeout(() => this.playSound(659, 1.0, 'sawtooth'), 500); // Bass E
                setTimeout(() => this.playSound(784, 1.2, 'sawtooth'), 1000); // Bass G
            }, 1500);
            
        } catch (e) {
            console.log('Game ending fanfare playback failed:', e);
        }
    }

    // Debounced MathJax rendering to improve performance
    async showGameBrowser() {
        this.showScreen('game-browser');
        await this.refreshActiveGames();
    }

    async refreshActiveGames() {
        const gamesContainer = document.getElementById('games-list');
        gamesContainer.innerHTML = `<div class="loading-games">${getTranslation('loading_games')}</div>`;

        try {
            const response = await fetch('api/active-games');
            const data = await response.json();

            if (data.games && data.games.length > 0) {
                gamesContainer.innerHTML = '';
                data.games.forEach(game => this.createGameCard(game));
            } else {
                gamesContainer.innerHTML = `
                    <div class="no-games">
                        <h3>No active games found</h3>
                        <p>Ask someone to host a game or create your own!</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Failed to fetch active games:', error);
            gamesContainer.innerHTML = `
                <div class="no-games">
                    <h3>Failed to load games</h3>
                    <p>Please check your connection and try again.</p>
                </div>
            `;
        }
    }

    createGameCard(game) {
        const gamesContainer = document.getElementById('games-list');
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        
        gameCard.innerHTML = `
            <h3>${this.escapeHtml(game.title)}</h3>
            <div class="game-info">
                <span class="game-pin">${game.pin}</span>
            </div>
            <div class="game-stats">
                <div class="game-stat">
                    <span>👥</span>
                    <span>${game.playerCount} players</span>
                </div>
                <div class="game-stat">
                    <span>📝</span>
                    <span>${game.questionCount} questions</span>
                </div>
            </div>
            <button class="join-game-btn" onclick="window.game.joinGameByPin('${game.pin}')">
                Join Game
            </button>
        `;
        
        gamesContainer.appendChild(gameCard);
    }

    joinGameByPin(pin) {
        // Pre-fill the PIN and switch to join screen
        document.getElementById('game-pin-input').value = pin;
        this.showScreen('join-screen');
        
        // Focus on the name input
        setTimeout(() => {
            document.getElementById('player-name').focus();
        }, 100);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    initializeLanguage() {
        // Load saved language preference
        const savedLanguage = localStorage.getItem('language') || 'en';
        setLanguage(savedLanguage);
    }

    renderMathJax() {
        if (this.mathJaxRenderTimeout) {
            clearTimeout(this.mathJaxRenderTimeout);
        }
        
        this.mathJaxRenderTimeout = setTimeout(() => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                // Add processing class to elements with math content
                const elementsWithMath = document.querySelectorAll('[data-has-math], .question-text, #current-question, #player-question-text, .player-option, .option-display');
                elementsWithMath.forEach(el => {
                    if (el.textContent.includes('$') || el.innerHTML.includes('$')) {
                        el.classList.add('processing-math');
                    }
                });
                
                // Use requestAnimationFrame to avoid blocking UI interactions
                requestAnimationFrame(() => {
                    // Clear existing MathJax processed content before re-rendering
                    document.querySelectorAll('.MathJax_Processing').forEach(el => {
                        el.classList.remove('MathJax_Processing');
                    });
                    
                    window.MathJax.typesetPromise().then(() => {
                        // Post-processing to ensure proper display
                        document.querySelectorAll('.mjx-container').forEach(container => {
                            container.style.display = 'inline-block';
                            container.style.verticalAlign = 'middle';
                            container.classList.add('MathJax_Processed');
                            
                            // Ensure LaTeX content is properly sized
                            if (container.closest('.player-option, .tf-option, .checkbox-option')) {
                                container.style.fontSize = '0.9em';
                                container.style.maxWidth = '100%';
                            }
                        });
                        
                        // Remove processing classes and show content
                        elementsWithMath.forEach(el => {
                            el.classList.remove('processing-math');
                            el.classList.add('math-ready');
                        });
                    }).catch(err => {
                        console.warn('MathJax rendering failed:', err);
                        // Remove processing classes even on error
                        elementsWithMath.forEach(el => {
                            el.classList.remove('processing-math');
                            el.classList.add('math-ready');
                        });
                    });
                });
            }
        }, 30); // Even faster for global rendering
    }

    // Efficient button style reset helper
    resetButtonStyles(elements) {
        if (!elements) return;
        
        // Use a batch DOM update for better performance
        const stylesToReset = ['border', 'backgroundColor', 'color', 'fontWeight'];
        const classesToRemove = ['selected', 'correct', 'incorrect'];
        
        Array.from(elements).forEach(element => {
            stylesToReset.forEach(style => element.style[style] = '');
            element.classList.remove(...classesToRemove);
        });
    }

    updateAnswerStatistics(data) {
        if (!this.isHost || !data) return;

        const statisticsContainer = document.getElementById('answer-statistics');
        if (!statisticsContainer) return;

        // Use requestAnimationFrame to prevent race conditions with DOM updates
        requestAnimationFrame(() => {
            // Reset statistics first to ensure clean display
            this.resetAnswerStatistics();

            // Show statistics container
            statisticsContainer.style.display = 'block';

            // Update response counts
            const responsesCount = document.getElementById('responses-count');
            const totalPlayers = document.getElementById('total-players');
            
            if (responsesCount) responsesCount.textContent = data.answeredPlayers || 0;
            if (totalPlayers) totalPlayers.textContent = data.totalPlayers || 0;

            // Handle different question types
            if (data.questionType === 'multiple-choice' || data.questionType === 'multiple-correct') {
                this.showMultipleChoiceStatistics(4);
                // Update individual answer statistics using answerCounts object
                for (let i = 0; i < 4; i++) {
                    const count = data.answerCounts[i] || 0;
                    this.updateStatItem(i, count, data.answeredPlayers || 0);
                }
            } else if (data.questionType === 'true-false') {
                this.showTrueFalseStatistics();
                const trueCount = data.answerCounts['true'] || 0;
                const falseCount = data.answerCounts['false'] || 0;
                this.updateStatItem(0, trueCount, data.answeredPlayers || 0);
                this.updateStatItem(1, falseCount, data.answeredPlayers || 0);
            } else if (data.questionType === 'numeric') {
                this.hideAnswerStatistics();
            }
        });
    }

    updateStatItem(optionIndex, count, totalResponses) {
        const statItem = document.querySelector(`.stat-item[data-option="${optionIndex}"]`);
        if (!statItem) return;

        const statFill = statItem.querySelector('.stat-fill');
        const statCount = statItem.querySelector('.stat-count');

        if (statCount) statCount.textContent = count || 0;

        if (statFill && totalResponses > 0) {
            const percentage = Math.round(((count || 0) / totalResponses) * 100);
            statFill.style.width = `${percentage}%`;
        } else if (statFill) {
            statFill.style.width = '0%';
        }
    }

    showTrueFalseStatistics() {
        const statItems = document.querySelectorAll('.stat-item');
        statItems.forEach((item, index) => {
            if (index < 2) {
                item.style.display = 'flex';
                const label = item.querySelector('.option-label');
                if (label) {
                    label.textContent = index === 0 ? getTranslation('true_display') : getTranslation('false_display');
                }
            } else {
                item.style.display = 'none';
            }
        });
    }

    showMultipleChoiceStatistics(optionCount = 4) {
        const statItems = document.querySelectorAll('.stat-item');
        statItems.forEach((item, index) => {
            if (index < optionCount) {
                item.style.display = 'flex';
                const label = item.querySelector('.option-label');
                if (label) {
                    label.textContent = getOptionLetter(index); // A, B, C, D
                }
            } else {
                item.style.display = 'none';
            }
        });
    }

    hideAnswerStatistics() {
        const statisticsContainer = document.getElementById('answer-statistics');
        if (statisticsContainer) {
            statisticsContainer.style.display = 'none';
        }
    }

    resetAnswerStatistics() {
        const statItems = document.querySelectorAll('.stat-item');
        statItems.forEach(item => {
            const statFill = item.querySelector('.stat-fill');
            const statCount = item.querySelector('.stat-count');
            
            if (statFill) {
                statFill.style.width = '0%';
            }
            if (statCount) {
                statCount.textContent = '0';
            }
        });

        const responsesCount = document.getElementById('responses-count');
        if (responsesCount) responsesCount.textContent = '0';

        this.hideAnswerStatistics();
    }

    // Preview Mode Functions
    initializePreview() {
        this.currentPreviewQuestion = 0;
        this.setupPreviewEventListeners();
        this.updatePreview();
    }

    initializeSplitPreview() {
        this.currentPreviewQuestion = 0;
        this.setupSplitPreviewEventListeners();
        this.updateSplitPreview();
    }

    setupPreviewEventListeners() {
        // Only set up listeners once
        if (this.previewListenersSet) return;
        this.previewListenersSet = true;

        // Navigation buttons
        const prevBtn = document.getElementById('preview-prev');
        const nextBtn = document.getElementById('preview-next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPreviewQuestion > 0) {
                    this.currentPreviewQuestion--;
                    this.updatePreview();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const questionItems = document.querySelectorAll('.question-item');
                if (this.currentPreviewQuestion < questionItems.length - 1) {
                    this.currentPreviewQuestion++;
                    this.updatePreview();
                }
            });
        }

        // Real-time updates
        this.setupRealTimePreviewUpdates();
    }

    setupRealTimePreviewUpdates() {
        // Listen for changes in question text, options, etc.
        const updatePreviewDebounced = this.debounce(() => this.updatePreview(), 300);

        // Question text changes
        document.addEventListener('input', (e) => {
            if (e.target.matches('.question-text, .option, .numeric-answer, .numeric-tolerance')) {
                updatePreviewDebounced();
            }
        });

        // Question type changes
        document.addEventListener('change', (e) => {
            if (e.target.matches('.question-type, .question-difficulty')) {
                updatePreviewDebounced();
            }
        });

        // Image uploads
        document.addEventListener('change', (e) => {
            if (e.target.matches('.image-input')) {
                updatePreviewDebounced();
            }
        });
    }

    updatePreview() {
        const questionItems = document.querySelectorAll('.question-item');
        const totalQuestions = questionItems.length;
        
        if (totalQuestions === 0) {
            this.showEmptyPreview();
            return;
        }

        // Update navigation
        this.updatePreviewNavigation(totalQuestions);
        
        // Get current question data
        const currentQuestion = questionItems[this.currentPreviewQuestion];
        if (!currentQuestion) return;

        const questionData = this.extractQuestionDataForPreview(currentQuestion);
        this.renderQuestionPreview(questionData);
    }

    updatePreviewNavigation(totalQuestions) {
        document.getElementById('preview-question-counter').textContent = 
            getTranslation('question_x_of_y', this.currentPreviewQuestion + 1, totalQuestions);
        
        document.getElementById('preview-prev').disabled = this.currentPreviewQuestion === 0;
        document.getElementById('preview-next').disabled = this.currentPreviewQuestion === totalQuestions - 1;
    }

    extractQuestionDataForPreview(questionItem) {
        const questionText = questionItem.querySelector('.question-text').value.trim() || getTranslation('enter_question_preview');
        const questionType = questionItem.querySelector('.question-type').value;
        const imageElement = questionItem.querySelector('.question-image');
        const imageUrl = imageElement ? imageElement.dataset.url || '' : '';

        let options = [];
        switch (questionType) {
            case 'multiple-choice':
                options = Array.from(questionItem.querySelectorAll('.multiple-choice-options .option'))
                    .map(opt => opt.value.trim() || 'Option text');
                break;
            case 'multiple-correct':
                options = Array.from(questionItem.querySelectorAll('.multiple-correct-options .option'))
                    .map(opt => opt.value.trim() || 'Option text');
                break;
        }

        return {
            questionNumber: this.currentPreviewQuestion + 1,
            totalQuestions: document.querySelectorAll('.question-item').length,
            question: questionText,
            type: questionType,
            options: options,
            image: imageUrl
        };
    }

    renderQuestionPreview(data) {
        // Update question counter and text
        document.getElementById('preview-question-counter-display').textContent = 
            getTranslation('question_x_of_y', data.questionNumber, data.totalQuestions);
        const previewElement = document.getElementById('preview-question-text');
        previewElement.innerHTML = this.formatCodeBlocks(data.question);
        previewElement.dataset.hasContent = 'true'; // Mark as having dynamic content

        // Handle image
        const imageDisplay = document.getElementById('preview-question-image');
        const img = document.getElementById('preview-question-img');
        if (data.image) {
            img.src = data.image;
            imageDisplay.style.display = 'block';
        } else {
            imageDisplay.style.display = 'none';
        }

        // Hide all answer types
        document.querySelectorAll('.preview-answer-type').forEach(type => type.style.display = 'none');

        // Show appropriate answer type
        switch (data.type) {
            case 'multiple-choice':
                this.renderMultipleChoicePreview(data.options);
                break;
            case 'multiple-correct':
                this.renderMultipleCorrectPreview(data.options);
                break;
            case 'true-false':
                this.renderTrueFalsePreview();
                break;
            case 'numeric':
                this.renderNumericPreview();
                break;
        }

        // Render LaTeX in preview
        setTimeout(() => {
            this.renderMathJax(document.getElementById('preview-question-text'));
            this.renderMathJax(document.getElementById('preview-answer-area'));
        }, 100);
    }

    renderMultipleChoicePreview(options) {
        document.getElementById('preview-multiple-choice').style.display = 'block';
        const previewOptions = document.querySelectorAll('#preview-multiple-choice .preview-option');
        
        previewOptions.forEach((option, index) => {
            if (options && options[index]) {
                const formattedOption = this.formatCodeBlocks(options[index]);
                option.innerHTML = `${String.fromCharCode(65 + index)}: ${formattedOption}`;
                option.style.display = 'flex';
            } else {
                option.style.display = 'none';
            }
        });
    }

    renderMultipleCorrectPreview(options) {
        document.getElementById('preview-multiple-correct').style.display = 'block';
        const previewCheckboxes = document.querySelectorAll('#preview-multiple-correct .preview-checkbox');
        
        previewCheckboxes.forEach((checkbox, index) => {
            if (options && options[index]) {
                const formattedOption = this.formatCodeBlocks(options[index]);
                checkbox.innerHTML = `<input type="checkbox" disabled> ${getOptionLetter(index)}: ${formattedOption}`;
                checkbox.style.display = 'flex';
            } else {
                checkbox.style.display = 'none';
            }
        });
    }

    renderTrueFalsePreview() {
        document.getElementById('preview-true-false').style.display = 'block';
    }

    renderNumericPreview() {
        document.getElementById('preview-numeric').style.display = 'block';
    }

    showEmptyPreview() {
        const previewElement = document.getElementById('preview-question-text');
        previewElement.textContent = getTranslation('add_question_preview');
        previewElement.dataset.hasContent = 'true'; // Mark as having dynamic content
        document.getElementById('preview-question-counter-display').textContent = 'No questions';
        document.querySelectorAll('.preview-answer-type').forEach(type => type.style.display = 'none');
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Split Screen Preview Methods
    setupSplitPreviewEventListeners() {
        // Only set up listeners once
        if (this.splitPreviewListenersSet) return;
        this.splitPreviewListenersSet = true;

        // Navigation buttons for split screen
        const prevBtn = document.getElementById('preview-prev-split');
        const nextBtn = document.getElementById('preview-next-split');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPreviewQuestion > 0) {
                    this.currentPreviewQuestion--;
                    this.updateSplitPreview();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const questionItems = document.querySelectorAll('.question-item');
                if (this.currentPreviewQuestion < questionItems.length - 1) {
                    this.currentPreviewQuestion++;
                    this.updateSplitPreview();
                }
            });
        }

        // Real-time updates for split screen
        this.setupRealTimeSplitPreviewUpdates();
    }

    setupRealTimeSplitPreviewUpdates() {
        // Listen for changes in question text, options, etc.
        const updatePreviewDebounced = this.debounce(() => this.updateSplitPreview(), 300);

        // Question text changes
        document.addEventListener('input', (e) => {
            if (e.target.matches('.question-text, .option, .numeric-answer, .numeric-tolerance')) {
                updatePreviewDebounced();
            }
        });

        // Question type changes
        document.addEventListener('change', (e) => {
            if (e.target.matches('.question-type, .question-difficulty')) {
                updatePreviewDebounced();
            }
        });

        // Image uploads
        document.addEventListener('change', (e) => {
            if (e.target.matches('.image-input')) {
                updatePreviewDebounced();
            }
        });
    }

    updateSplitPreview() {
        const questionItems = document.querySelectorAll('.question-item');
        const totalQuestions = questionItems.length;
        
        if (totalQuestions === 0) {
            this.showEmptySplitPreview();
            return;
        }

        // Update navigation
        this.updateSplitPreviewNavigation(totalQuestions);
        
        // Get current question data
        const currentQuestion = questionItems[this.currentPreviewQuestion];
        if (!currentQuestion) return;

        const questionData = this.extractQuestionDataForPreview(currentQuestion);
        this.renderSplitQuestionPreview(questionData);
    }

    updateSplitPreviewNavigation(totalQuestions) {
        document.getElementById('preview-question-counter-split').textContent = 
            getTranslation('question_x_of_y', this.currentPreviewQuestion + 1, totalQuestions);
        
        document.getElementById('preview-prev-split').disabled = this.currentPreviewQuestion === 0;
        document.getElementById('preview-next-split').disabled = this.currentPreviewQuestion === totalQuestions - 1;
    }

    renderSplitQuestionPreview(data) {
        // Update question counter and text
        document.getElementById('preview-question-counter-display-split').textContent = 
            getTranslation('question_x_of_y', data.questionNumber, data.totalQuestions);
        const previewElementSplit = document.getElementById('preview-question-text-split');
        previewElementSplit.innerHTML = this.formatCodeBlocks(data.question);
        previewElementSplit.dataset.hasContent = 'true'; // Mark as having dynamic content

        // Handle image
        const imageDisplay = document.getElementById('preview-question-image-split');
        const img = document.getElementById('preview-question-img-split');
        if (data.image) {
            img.src = data.image;
            imageDisplay.style.display = 'block';
        } else {
            imageDisplay.style.display = 'none';
        }

        // Hide all answer types
        document.querySelectorAll('#preview-answer-area-split .preview-answer-type').forEach(type => type.style.display = 'none');

        // Show appropriate answer type
        switch (data.type) {
            case 'multiple-choice':
                this.renderSplitMultipleChoicePreview(data.options);
                break;
            case 'multiple-correct':
                this.renderSplitMultipleCorrectPreview(data.options);
                break;
            case 'true-false':
                this.renderSplitTrueFalsePreview();
                break;
            case 'numeric':
                this.renderSplitNumericPreview();
                break;
        }

        // Render LaTeX in split preview
        setTimeout(() => {
            this.renderMathJax(document.getElementById('preview-question-text-split'));
            this.renderMathJax(document.getElementById('preview-answer-area-split'));
        }, 100);
    }

    renderSplitMultipleChoicePreview(options) {
        // Ensure only Multiple Choice is visible
        document.getElementById('preview-multiple-correct-split').style.display = 'none';
        document.getElementById('preview-true-false-split').style.display = 'none';
        document.getElementById('preview-numeric-split').style.display = 'none';
        document.getElementById('preview-multiple-choice-split').style.display = 'block';
        
        const previewOptions = document.querySelectorAll('#preview-multiple-choice-split .preview-option');
        
        previewOptions.forEach((option, index) => {
            if (options && options[index]) {
                const formattedOption = this.formatCodeBlocks(options[index]);
                option.innerHTML = `${String.fromCharCode(65 + index)}: ${formattedOption}`;
                option.style.display = 'flex';
            } else {
                option.style.display = 'none';
            }
        });
    }

    renderSplitMultipleCorrectPreview(options) {
        // Ensure only Multiple Correct is visible
        document.getElementById('preview-multiple-choice-split').style.display = 'none';
        document.getElementById('preview-true-false-split').style.display = 'none';
        document.getElementById('preview-numeric-split').style.display = 'none';
        document.getElementById('preview-multiple-correct-split').style.display = 'block';
        
        const previewCheckboxes = document.querySelectorAll('#preview-multiple-correct-split .preview-checkbox');
        
        previewCheckboxes.forEach((checkbox, index) => {
            if (options && options[index]) {
                const formattedOption = this.formatCodeBlocks(options[index]);
                checkbox.innerHTML = `<input type="checkbox" disabled> ${getOptionLetter(index)}: ${formattedOption}`;
                checkbox.style.display = 'flex';
            } else {
                checkbox.style.display = 'none';
            }
        });
    }

    renderSplitTrueFalsePreview() {
        // Ensure only True/False is visible
        document.getElementById('preview-multiple-choice-split').style.display = 'none';
        document.getElementById('preview-multiple-correct-split').style.display = 'none';
        document.getElementById('preview-numeric-split').style.display = 'none';
        document.getElementById('preview-true-false-split').style.display = 'block';
    }

    renderSplitNumericPreview() {
        // Ensure only Numeric is visible
        document.getElementById('preview-multiple-choice-split').style.display = 'none';
        document.getElementById('preview-multiple-correct-split').style.display = 'none';
        document.getElementById('preview-true-false-split').style.display = 'none';
        document.getElementById('preview-numeric-split').style.display = 'block';
    }

    showEmptySplitPreview() {
        const previewElementSplit = document.getElementById('preview-question-text-split');
        previewElementSplit.textContent = getTranslation('add_question_preview');
        previewElementSplit.dataset.hasContent = 'true'; // Mark as having dynamic content
        document.getElementById('preview-question-counter-display-split').textContent = 'No questions';
        document.querySelectorAll('#preview-answer-area-split .preview-answer-type').forEach(type => type.style.display = 'none');
    }
}

// Global function to scroll to current question in editor
function scrollToCurrentQuestion() {
    if (window.game && typeof window.game.currentPreviewQuestion !== 'undefined') {
        const questionItems = document.querySelectorAll('.question-item');
        const targetQuestion = questionItems[window.game.currentPreviewQuestion];
        if (targetQuestion) {
            targetQuestion.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
            
            // Add a brief highlight effect
            targetQuestion.style.background = 'rgba(255, 215, 0, 0.2)';
            targetQuestion.style.transform = 'scale(1.02)';
            
            setTimeout(() => {
                targetQuestion.style.background = '';
                targetQuestion.style.transform = '';
            }, 1500);
        }
    }
}

// Global function to show/hide toolbar
function toggleToolbar() {
    const toolbar = document.getElementById('left-toolbar');
    const hostScreen = document.getElementById('host-screen');
    
    if (toolbar.style.display === 'none' || !toolbar.style.display) {
        // Show toolbar
        toolbar.style.display = 'block';
        hostScreen.classList.add('with-toolbar');
        localStorage.setItem('toolbarVisible', 'true');
    } else {
        // Hide toolbar
        toolbar.style.display = 'none';
        hostScreen.classList.remove('with-toolbar', 'collapsed');
        localStorage.setItem('toolbarVisible', 'false');
    }
}

// Global function to collapse/expand toolbar
function toggleToolbarCollapse() {
    const toolbar = document.getElementById('left-toolbar');
    const hostScreen = document.getElementById('host-screen');
    
    if (toolbar.classList.contains('collapsed')) {
        toolbar.classList.remove('collapsed');
        hostScreen.classList.remove('collapsed');
        localStorage.setItem('toolbarCollapsed', 'false');
    } else {
        toolbar.classList.add('collapsed');
        hostScreen.classList.add('collapsed');
        localStorage.setItem('toolbarCollapsed', 'true');
    }
}

// Global function to open preview settings
function openPreviewSettings() {
    const sidebar = document.getElementById('preview-settings-sidebar');
    if (sidebar) {
        sidebar.style.display = 'block';
    }
}

// Global function to close AI generator modal
function closeAIGeneratorModal() {
    const modal = document.getElementById('ai-generator-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Global function to open AI generator modal
function openAIGeneratorModal() {
    const modal = document.getElementById('ai-generator-modal');
    if (modal) {
        modal.style.display = 'flex';
        
        // Add escape key and backdrop click listeners
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeAIGeneratorModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        
        const handleBackdrop = (e) => {
            if (e.target === modal) {
                closeAIGeneratorModal();
                modal.removeEventListener('click', handleBackdrop);
            }
        };
        
        document.addEventListener('keydown', handleEscape);
        modal.addEventListener('click', handleBackdrop);
    }
}

// Global helper functions for preview mode
let isPreviewMode = false;

function togglePreviewMode() {
    const hostContainer = document.getElementById('host-container');
    const previewSection = document.getElementById('quiz-preview-section');
    const toggleButton = document.getElementById('toggle-preview');
    
    if (!isPreviewMode) {
        // Enable split-screen mode
        hostContainer.classList.add('split-screen');
        previewSection.style.display = 'flex';
        toggleButton.textContent = getTranslation('close_preview');
        toggleButton.classList.remove('secondary');
        toggleButton.classList.add('danger');
        
        // Initialize preview
        if (window.game) {
            window.game.initializeSplitPreview();
        }
        
        isPreviewMode = true;
    } else {
        // Disable split-screen mode
        hostContainer.classList.remove('split-screen');
        previewSection.style.display = 'none';
        toggleButton.textContent = getTranslation('toggle_live_preview');
        toggleButton.classList.remove('danger');
        toggleButton.classList.add('secondary');
        
        isPreviewMode = false;
    }
}

function openPreviewModal() {
    const overlay = document.getElementById('preview-modal-overlay');
    overlay.style.display = 'flex';
    
    // Initialize preview with current question
    if (window.game) {
        window.game.initializePreview();
    }
    
    // Add escape key listener
    document.addEventListener('keydown', handlePreviewEscape);
    
    // Add backdrop click listener
    overlay.addEventListener('click', handleBackdropClick);
}

function closePreviewModal() {
    const overlay = document.getElementById('preview-modal-overlay');
    overlay.style.display = 'none';
    
    // Remove escape key listener
    document.removeEventListener('keydown', handlePreviewEscape);
    
    // Remove backdrop click listener
    overlay.removeEventListener('click', handleBackdropClick);
}

function handlePreviewEscape(e) {
    if (e.key === 'Escape') {
        closePreviewModal();
    }
}

function handleBackdropClick(e) {
    // Only close if clicking on the overlay itself, not the modal content
    if (e.target === e.currentTarget) {
        closePreviewModal();
    }
}

function setPreviewDevice(deviceType) {
    // Handle both modal and split screen previews
    const viewport = document.getElementById('preview-viewport') || document.getElementById('preview-viewport-split');
    
    // Modal version
    const desktopBtn = document.getElementById('desktop-view');
    const mobileBtn = document.getElementById('mobile-view');
    
    // Split screen version
    const desktopBtnSplit = document.getElementById('desktop-view-split');
    const mobileBtnSplit = document.getElementById('mobile-view-split');
    
    // Update button states for both versions
    if (desktopBtn && mobileBtn) {
        desktopBtn.classList.toggle('active', deviceType === 'desktop');
        mobileBtn.classList.toggle('active', deviceType === 'mobile');
    }
    
    if (desktopBtnSplit && mobileBtnSplit) {
        desktopBtnSplit.classList.toggle('active', deviceType === 'desktop');
        mobileBtnSplit.classList.toggle('active', deviceType === 'mobile');
    }
    
    // Update viewport class
    if (viewport) {
        if (deviceType === 'mobile') {
            viewport.className = viewport.classList.contains('preview-viewport-split') 
                ? 'preview-viewport-split mobile-viewport' 
                : 'preview-viewport mobile-viewport';
        } else {
            viewport.className = viewport.classList.contains('preview-viewport-split') 
                ? 'preview-viewport-split desktop-viewport' 
                : 'preview-viewport desktop-viewport';
        }
    }
}

// Global helper functions for time configuration
function toggleGlobalTime() {
    const useGlobalTime = document.getElementById('use-global-time').checked;
    const globalTimeContainer = document.getElementById('global-time-container');
    const questionTimeLimits = document.querySelectorAll('.question-time-limit');
    
    if (useGlobalTime) {
        globalTimeContainer.style.display = 'block';
        // Disable individual time inputs
        questionTimeLimits.forEach(input => {
            input.disabled = true;
            input.style.opacity = '0.6';
        });
    } else {
        globalTimeContainer.style.display = 'none';
        // Enable individual time inputs
        questionTimeLimits.forEach(input => {
            input.disabled = false;
            input.style.opacity = '1';
        });
    }
}

function updateTimeLimit(input) {
    const value = parseInt(input.value);
    if (value < 5) {
        input.value = 5;
    } else if (value > 300) {
        input.value = 300;
    }
}

function applyGlobalTimeToAll() {
    const globalTimeLimit = document.getElementById('global-time-limit').value;
    const questionTimeLimits = document.querySelectorAll('.question-time-limit');
    
    questionTimeLimits.forEach(input => {
        input.value = globalTimeLimit;
    });
}

// Add event listener for global time limit changes
document.addEventListener('DOMContentLoaded', function() {
    const globalTimeLimit = document.getElementById('global-time-limit');
    if (globalTimeLimit) {
        globalTimeLimit.addEventListener('change', function() {
            updateTimeLimit(this);
            if (document.getElementById('use-global-time').checked) {
                applyGlobalTimeToAll();
            }
        });
    }
});

// Global helper functions for question creation
function updateQuestionType(select) {
    const questionItem = select.closest('.question-item');
    const type = select.value;
    
    questionItem.querySelectorAll('.answer-options').forEach(option => {
        option.style.display = 'none';
    });
    
    const targetOption = questionItem.querySelector(`.${type}-options`);
    if (targetOption) {
        targetOption.style.display = 'block';
    }
}

async function uploadImage(input) {
    if (!input.files || !input.files[0]) return;
    
    const formData = new FormData();
    formData.append('image', input.files[0]);
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.url) {
            const questionItem = input.closest('.question-item');
            if (questionItem) {
                const preview = questionItem.querySelector('.image-preview');
                const img = questionItem.querySelector('.question-image');
                
                if (img) {
                    img.src = result.url;
                    img.dataset.url = result.url;
                }
                if (preview) {
                    preview.style.display = 'block';
                }
            }
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showAlert('failed_upload_image');
    }
}

function removeImage(button) {
    const questionItem = button.closest('.question-item');
    if (!questionItem) return;
    
    const preview = questionItem.querySelector('.image-preview');
    const img = questionItem.querySelector('.question-image');
    const input = questionItem.querySelector('.image-input');
    
    preview.style.display = 'none';
    img.src = '';
    img.dataset.url = '';
    input.value = '';
}

// AI Question Generation System
class AIQuestionGenerator {
    constructor() {
        this.providers = {
            ollama: {
                name: "Ollama (Local)",
                apiKey: false,
                endpoint: "http://localhost:11434/api/generate",
                models: ["qwen2.5:7b", "qwen2.5:3b", "llama3.1:8b", "phi3:mini"]
            },
            huggingface: {
                name: "Hugging Face",
                apiKey: true,
                endpoint: "https://api-inference.huggingface.co/models/google/flan-t5-large",
                models: ["google/flan-t5-large"]
            },
            openai: {
                name: "OpenAI",
                apiKey: true,
                endpoint: "https://api.openai.com/v1/chat/completions",
                models: ["gpt-3.5-turbo", "gpt-4"]
            },
            claude: {
                name: "Anthropic Claude", 
                apiKey: true,
                endpoint: "https://api.anthropic.com/v1/messages",
                models: ["claude-3-haiku", "claude-3-sonnet"]
            }
        };
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Provider selection change
        document.getElementById('ai-provider').addEventListener('change', (e) => {
            this.handleProviderChange(e.target.value);
        });

        // Model selection change
        document.getElementById('ollama-model').addEventListener('change', (e) => {
            if (e.target.value) {
                localStorage.setItem('ollama_selected_model', e.target.value);
            }
        });

        // File upload handling
        document.getElementById('content-file').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });

        // Content type detection on input
        document.getElementById('source-content').addEventListener('input', (e) => {
            this.updateContentTypeIndicator(e.target.value);
        });

        // Generation button
        document.getElementById('generate-questions').addEventListener('click', () => {
            this.generateQuestions();
        });

        // Cancel button
        document.getElementById('cancel-ai-generator').addEventListener('click', () => {
            this.closeModal();
        });
    }

    handleProviderChange(provider) {
        const apiKeySection = document.getElementById('api-key-section');
        const modelSelection = document.getElementById('model-selection');
        const needsApiKey = this.providers[provider].apiKey;
        
        if (needsApiKey) {
            apiKeySection.style.display = 'block';
            // Load saved API key if exists
            const savedKey = localStorage.getItem(`ai_api_key_${provider}`);
            if (savedKey) {
                document.getElementById('ai-api-key').value = savedKey;
            }
        } else {
            apiKeySection.style.display = 'none';
        }
        
        // Show model selection for Ollama
        if (provider === 'ollama') {
            modelSelection.style.display = 'block';
            this.loadOllamaModels();
        } else {
            modelSelection.style.display = 'none';
        }
    }

    async loadOllamaModels() {
        const modelSelect = document.getElementById('ollama-model');
        modelSelect.innerHTML = `<option value="">${getTranslation('loading_models')}</option>`;
        
        try {
            const response = await fetch('api/ollama/models');
            
            if (!response.ok) {
                throw new Error(getTranslation('failed_fetch_models'));
            }
            
            const data = await response.json();
            modelSelect.innerHTML = '';
            
            if (data.models && data.models.length > 0) {
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = `${model.name} (${this.formatModelSize(model.size)})`;
                    modelSelect.appendChild(option);
                });
                
                // Load saved model selection
                const savedModel = localStorage.getItem('ollama_selected_model');
                if (savedModel && data.models.some(m => m.name === savedModel)) {
                    modelSelect.value = savedModel;
                }
            } else {
                modelSelect.innerHTML = `<option value="">${getTranslation('no_models_available')}</option>`;
            }
        } catch (error) {
            console.error('Error loading Ollama models:', error);
            modelSelect.innerHTML = `<option value="">${getTranslation('error_loading_models')}</option>`;
        }
    }

    formatModelSize(bytes) {
        if (!bytes) return 'Unknown size';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let size = bytes;
        
        while (size >= 1024 && i < sizes.length - 1) {
            size /= 1024;
            i++;
        }
        
        return `${size.toFixed(1)} ${sizes[i]}`;
    }

    async handleFileUpload(file) {
        if (!file) return;

        const sourceContent = document.getElementById('source-content');
        
        try {
            if (file.type === 'text/plain' || file.name.endsWith('.md')) {
                const text = await file.text();
                sourceContent.value = text;
                this.updateContentTypeIndicator(text);
            } else if (file.type === 'application/pdf') {
                // For now, just show a message that PDF parsing will be added
                showAlert('pdf_parsing_future_update');
            } else if (file.name.endsWith('.docx')) {
                showAlert('docx_parsing_future_update');
            } else {
                showAlert('unsupported_file_format');
            }
        } catch (error) {
            console.error('Error reading file:', error);
            showAlert('error_reading_file');
        }
    }

    updateContentTypeIndicator(content) {
        const indicator = document.getElementById('content-type-indicator');
        const typeValue = document.getElementById('content-type-value');
        const typeDescription = document.getElementById('content-type-description');

        if (!content.trim()) {
            indicator.style.display = 'none';
            return;
        }

        const contentType = this.detectContentType(content);
        const descriptions = {
            'mathematics': 'Questions will include LaTeX math notation (e.g., $x^2$, $\\int f(x)dx$)',
            'programming': 'Questions will include properly formatted code snippets',
            'physics': 'Questions will include physics formulas and proper units',
            'chemistry': 'Questions will include chemical equations and notation',
            'general': 'Questions will use standard formatting'
        };

        typeValue.textContent = contentType;
        typeDescription.textContent = descriptions[contentType];
        indicator.style.display = 'flex';

        // Add visual emphasis for special content types
        if (contentType === 'mathematics') {
            typeValue.style.background = 'rgba(156, 39, 176, 0.2)';
            typeValue.style.color = '#9c27b0';
        } else if (contentType === 'programming') {
            typeValue.style.background = 'rgba(76, 175, 80, 0.2)';
            typeValue.style.color = '#4caf50';
        } else {
            typeValue.style.background = 'rgba(102, 126, 234, 0.2)';
            typeValue.style.color = '#667eea';
        }
    }

    buildPrompt(content, options) {
        const questionTypes = [];
        if (document.getElementById('type-multiple-choice').checked) questionTypes.push('multiple-choice');
        if (document.getElementById('type-true-false').checked) questionTypes.push('true-false');
        if (document.getElementById('type-multiple-correct').checked) questionTypes.push('multiple-correct');
        if (document.getElementById('type-numeric').checked) questionTypes.push('numeric');

        // Detect content type for specialized formatting
        const contentType = this.detectContentType(content);
        const formatInstructions = this.getFormatInstructions(contentType);

        // Determine language based on current UI language and content language hints
        const languagePrompt = currentLanguage === 'es' ? 
            'Generate questions in SPANISH. All question text, options, and explanations must be in Spanish.' :
            'Generate questions in ENGLISH.';
            
        return `You must create ${options.count} quiz questions about the EXACT content provided below. Use the specific functions, equations, or examples given.

${languagePrompt}

CONTENT TO USE:
${content}

Requirements:
- Number of questions: ${options.count}
- Question types: ${questionTypes.join(', ')}
- Difficulty level: ${options.difficulty}
- Content type detected: ${contentType}

${formatInstructions}

MANDATORY RULES:
1. Questions must be about the SPECIFIC functions/equations/examples in the content
2. If content mentions "sin(t) + cos(t)", ask about sin(t) + cos(t), NOT exp(-2t) or other functions
3. If content mentions "2x + 3y = 7", ask about that exact equation, not generic ones
4. Use the EXACT mathematical expressions provided in the content
5. Do not substitute different functions or change the specific examples given
6. Focus on the precise material provided, not general concepts

Return ONLY a JSON array in this EXACT format:

[{
  "question": "What is the Fourier transform of f(t)?",
  "type": "multiple-choice", 
  "options": ["First math expression", "Second math expression", "Third math expression", "Fourth math expression"],
  "correctAnswer": 2,
  "difficulty": "medium",
  "timeLimit": 30
}]

STRICT RULES:
1. "question" = ONLY the question text, NO A) B) C) D) choices
2. "options" = Array of 4 answer choices WITHOUT A) B) C) D) labels
3. "correctAnswer" = Number 0, 1, 2, or 3 (NOT "A" or "C)")
4. Use single backslashes in LaTeX: $\\frac{1}{2}$ not $\\\\frac{1}{2}$
5. NO explanatory text outside the JSON array`;
    }

    detectContentType(content) {
        const mathKeywords = ['equation', 'derivative', 'integral', 'function', 'theorem', 'proof', 'matrix', 'vector', 'calculus', 'algebra', 'geometry', 'trigonometry', 'polynomial', 'logarithm', 'exponential'];
        const codeKeywords = ['def ', 'function', 'class ', 'import ', 'return', 'if __name__', 'print(', 'console.log', 'public class', 'void main', '#include'];
        const physicsKeywords = ['force', 'energy', 'momentum', 'velocity', 'acceleration', 'electric', 'magnetic', 'quantum', 'wave', 'frequency'];
        const chemistryKeywords = ['molecule', 'atom', 'bond', 'reaction', 'element', 'compound', 'electron', 'proton', 'neutron'];

        const lowerContent = content.toLowerCase();
        
        let mathScore = mathKeywords.filter(kw => lowerContent.includes(kw)).length;
        let codeScore = codeKeywords.filter(kw => content.includes(kw)).length; // Case sensitive for code
        let physicsScore = physicsKeywords.filter(kw => lowerContent.includes(kw)).length;
        let chemistryScore = chemistryKeywords.filter(kw => lowerContent.includes(kw)).length;

        // Check for LaTeX/mathematical notation
        if (content.includes('\\') || content.includes('$$') || /\$[^$]+\$/.test(content)) {
            mathScore += 3;
        }

        // Check for code patterns
        if (/def\s+\w+\(/.test(content) || /function\s+\w+\(/.test(content) || /class\s+\w+/.test(content)) {
            codeScore += 3;
        }

        const maxScore = Math.max(mathScore, codeScore, physicsScore, chemistryScore);
        
        if (maxScore === 0) return 'general';
        if (mathScore === maxScore) return 'mathematics';
        if (codeScore === maxScore) return 'programming';
        if (physicsScore === maxScore) return 'physics';
        if (chemistryScore === maxScore) return 'chemistry';
        
        return 'general';
    }

    getFormatInstructions(contentType) {
        switch (contentType) {
            case 'mathematics':
                return `MATHEMATICAL CONTENT DETECTED:
- Use LaTeX notation for ALL mathematical expressions: $x^2$, $\\frac{a}{b}$, $\\int_0^\\infty e^{-x^2}dx$
- Include proper mathematical symbols: ∈, ∩, ∪, ≤, ≥, ∞, π, α, β, γ, θ, λ, μ, σ, Σ, ∏
- For calculus: use $\\frac{d}{dx}$, $\\int$, $\\lim_{x \\to \\infty}$
- For algebra: use $\\sqrt{x}$, $x^n$, $\\log_a(x)$, $e^x$
- For geometry: use proper notation for angles, lines, points
- For matrices: use $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ (always close with \\end{pmatrix})
- For eigenvalues: use $\\lambda_1, \\lambda_2$ or $\\lambda$ consistently
- For constants: use $i$ not $\\text{i}$, use $\\pi$ not $\\text{π}$, use $e$ not $\\text{e}$
- For functions: use $\\sqrt{-1}$ not $\\text{sqrt{-1}}$, use $\\sin(x)$ not $\\text{sin}(x)$
- For trig functions: use $\\sin(x)$, $\\cos(x)$, $\\tan(x)$ with parentheses, NOT $\\sin{x}$ or $\\tan{\\theta}$
- AVOID \\text{} for mathematical symbols - only use for actual text descriptions
- CRITICAL: Always complete LaTeX expressions - every \\begin{} must have matching \\end{}
- CRITICAL: Use double backslashes \\\\ for matrix row separators
- CRITICAL: Test your LaTeX mentally - it must be syntactically correct
- CRITICAL: Keep expressions simple and readable - avoid overly complex nested LaTeX
- Create questions that test conceptual understanding, not just computation
- Include common mathematical mistakes as wrong options`;

            case 'programming':
                return `PROGRAMMING CONTENT DETECTED:
- Format code snippets with proper syntax highlighting: \`\`\`python, \`\`\`javascript, \`\`\`java, etc.
- Use inline code formatting for keywords: \`def\`, \`class\`, \`return\`, \`if\`
- Include proper indentation in code blocks
- Test understanding of concepts like algorithms, data structures, syntax
- Create questions about code output, debugging, best practices
- Include realistic code examples that could appear in actual programs
- Wrong options should be plausible mistakes beginners might make`;

            case 'physics':
                return `PHYSICS CONTENT DETECTED:
- Use LaTeX for formulas: $F = ma$, $E = mc^2$, $v = \\frac{d}{dt}x(t)$
- Include proper units in questions and answers
- Use physics notation: vectors ($\\vec{F}$), scalars, subscripts
- Test conceptual understanding of physical principles
- Include numerical problems with realistic values`;

            case 'chemistry':
                return `CHEMISTRY CONTENT DETECTED:
- Use proper chemical notation: H₂O, CO₂, CH₄
- Include chemical equations with proper balancing
- Use LaTeX for complex formulas when needed
- Test understanding of chemical principles, not just memorization
- Include realistic chemical scenarios`;

            default:
                return `GENERAL CONTENT:
- Use clear, precise language
- Include LaTeX notation if any mathematical concepts appear: $x$, $y = mx + b$
- Format any code snippets properly with backticks
- Create questions that test understanding and application
- Make wrong options educational (common misconceptions)`;
        }
    }

    async generateQuestions() {
        const provider = document.getElementById('ai-provider').value;
        const content = document.getElementById('source-content').value.trim();
        const questionCount = parseInt(document.getElementById('question-count').value);
        const difficulty = document.getElementById('difficulty-level').value;

        // Validation
        if (!content) {
            showAlert('please_provide_source_material');
            return;
        }

        if (this.providers[provider].apiKey) {
            const apiKey = document.getElementById('ai-api-key').value.trim();
            if (!apiKey) {
                showAlert('please_enter_api_key');
                return;
            }
            // Save API key to localStorage
            localStorage.setItem(`ai_api_key_${provider}`, apiKey);
        }

        // Show loading status
        const statusDiv = document.getElementById('generation-status');
        const generateBtn = document.getElementById('generate-questions');
        statusDiv.style.display = 'flex';
        generateBtn.disabled = true;

        try {
            const prompt = this.buildPrompt(content, {
                count: questionCount,
                difficulty: difficulty
            });

            let questions;
            switch (provider) {
                case 'ollama':
                    questions = await this.generateWithOllama(prompt);
                    break;
                case 'huggingface':
                    questions = await this.generateWithHuggingFace(prompt);
                    break;
                case 'openai':
                    questions = await this.generateWithOpenAI(prompt);
                    break;
                case 'claude':
                    questions = await this.generateWithClaude(prompt);
                    break;
                default:
                    throw new Error(getTranslation('unsupported_provider'));
            }

            if (questions && questions.length > 0) {
                this.addGeneratedQuestions(questions);
                this.closeModal();
                showAlert('successfully_generated_questions', questions.length);
            } else {
                throw new Error(getTranslation('no_questions_generated'));
            }

        } catch (error) {
            console.error('Error generating questions:', error);
            showAlert('error_generating_questions_detail', error.message);
        } finally {
            statusDiv.style.display = 'none';
            generateBtn.disabled = false;
        }
    }

    async generateWithOllama(prompt) {
        try {
            const selectedModel = document.getElementById('ollama-model').value;
            
            if (!selectedModel) {
                throw new Error(getTranslation('select_ollama_model_first'));
            }
            
            // Add randomization and context clearing to prevent repetition
            const timestamp = Date.now();
            const randomSeed = Math.floor(Math.random() * 10000);
            const enhancedPrompt = `[Session: ${timestamp}-${randomSeed}] ${prompt}

IMPORTANT: Generate completely new and unique questions. Do not repeat any previous responses.`;
            
            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: selectedModel,
                    prompt: enhancedPrompt,
                    stream: false,
                    format: 'json',
                    options: {
                        temperature: 0.8,
                        top_p: 0.9,
                        seed: randomSeed
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}. Make sure Ollama is running locally.`);
            }

            const data = await response.json();
            console.log('Raw Ollama response:', data);
            return this.parseAIResponse(data.response);
        } catch (error) {
            if (error.message.includes('fetch')) {
                throw new Error(getTranslation('cannot_connect_ollama'));
            }
            throw error;
        }
    }

    async generateWithOpenAI(prompt) {
        const apiKey = document.getElementById('ai-api-key').value;
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        return this.parseAIResponse(data.choices[0].message.content);
    }

    async generateWithHuggingFace(prompt) {
        // Placeholder for Hugging Face implementation
        throw new Error(getTranslation('huggingface_integration_coming'));
    }

    async generateWithClaude(prompt) {
        const apiKey = document.getElementById('ai-api-key').value;
        
        if (!apiKey) {
            throw new Error(getTranslation('enter_claude_api_key'));
        }
        
        try {
            const response = await fetch('api/claude/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    apiKey: apiKey
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            console.log('Raw Claude response:', data);
            
            // Save API key for future use
            localStorage.setItem('ai_api_key_claude', apiKey);
            
            return this.parseAIResponse(data.content[0].text);
        } catch (error) {
            if (error.message.includes('fetch')) {
                throw new Error(getTranslation('cannot_connect_claude'));
            }
            throw error;
        }
    }

    parseAIResponse(responseText) {
        try {
            console.log('AI Response to parse:', responseText);
            
            // First try to parse the entire response as JSON
            let questions;
            try {
                const parsed = JSON.parse(responseText);
                questions = Array.isArray(parsed) ? parsed : [parsed];
                console.log('Successfully parsed JSON:', questions);
            } catch (parseError) {
                console.log('JSON parse failed:', parseError);
                // If that fails, try to extract JSON array from the response
                const arrayMatch = responseText.match(/\[[\s\S]*\]/);
                if (arrayMatch) {
                    questions = JSON.parse(arrayMatch[0]);
                } else {
                    // Try to extract a single JSON object
                    const objectMatch = responseText.match(/\{[\s\S]*\}/);
                    if (objectMatch) {
                        const singleQuestion = JSON.parse(objectMatch[0]);
                        questions = [singleQuestion];
                    } else {
                        throw new Error(getTranslation('no_valid_json_response'));
                    }
                }
            }
            
            console.log('About to validate questions:', questions);
            const validatedQuestions = this.validateQuestions(questions);
            console.log('Validation result:', validatedQuestions);
            return validatedQuestions;
        } catch (error) {
            console.error('Error parsing AI response:', responseText);
            console.error('Detailed error:', error);
            throw new Error(getTranslation('failed_parse_ai_response'));
        }
    }

    validateQuestions(questions) {
        const validQuestions = [];
        console.log('Validating questions, count:', questions.length);
        
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            console.log(`Validating question ${i}:`, q);
            
            if (q.question && q.type && q.correctAnswer !== undefined) {
                console.log('Basic validation passed for question', i);
                
                // Basic LaTeX validation - temporarily disabled for debugging
                const hasErrors = this.hasLatexErrors(q.question);
                if (hasErrors) {
                    console.warn('LaTeX validation would skip:', q.question);
                    console.warn('But allowing it through for now...');
                }
                console.log('LaTeX validation passed for question', i);
                
                // Set default values for missing fields
                q.difficulty = q.difficulty || 'medium';
                q.timeLimit = q.timeLimit || 20;
                
                // Validate question type
                if (['multiple-choice', 'true-false', 'multiple-correct', 'numeric'].includes(q.type)) {
                    console.log('Question type validation passed for question', i);
                    validQuestions.push(q);
                } else {
                    console.warn('Invalid question type:', q.type);
                }
            } else {
                console.warn('Question failed basic validation:', {
                    hasQuestion: !!q.question,
                    hasType: !!q.type,
                    hasCorrectAnswer: q.correctAnswer !== undefined
                });
            }
        }
        
        console.log('Validation complete. Valid questions:', validQuestions.length);
        return validQuestions;
    }

    hasLatexErrors(text) {
        // Check for unmatched LaTeX environments
        const beginMatches = (text.match(/\\begin\{[^}]+\}/g) || []).length;
        const endMatches = (text.match(/\\end\{[^}]+\}/g) || []).length;
        
        // Check for unmatched dollar signs
        const dollarMatches = (text.match(/\$/g) || []).length;
        
        // Check for incomplete LaTeX commands (but allow common math functions)
        const commonMathFunctions = /\\(sin|cos|tan|sec|csc|cot|log|ln|exp|sqrt|int|sum|prod|lim|frac|partial|nabla|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|infty|cdot|times|div|pm|mp|neq|leq|geq|approx|equiv|subset|supset|in|notin|cup|cap|emptyset|mathbb|mathcal|mathbf|text)\b/;
        const hasIncompleteCommands = /\\[a-zA-Z]+(?![a-zA-Z]|\{|\()/.test(text) && !commonMathFunctions.test(text);
        
        // Check for problematic LaTeX patterns
        const hasProblematicText = /\\text\{[iπe]\}/.test(text); // \text{i}, \text{π}, \text{e}
        const hasInvalidFunctions = /\\text\{sqrt|sin|cos|tan|log\}/.test(text); // \text{sqrt}, etc.
        const hasInvalidTrigSyntax = false; // Allow all trig function syntax
        
        // Check for bracket mismatches
        const hasUnmatchedParens = this.hasUnmatchedDelimiters(text, '(', ')');
        const hasUnmatchedBrackets = this.hasUnmatchedDelimiters(text, '[', ']');
        const hasUnmatchedBraces = this.hasUnmatchedDelimiters(text, '{', '}');
        
        // Check for double subscripts/superscripts without braces
        const hasDoubleScripts = /\^[^{]\^|\^[^{]*\^|_[^{]_|_[^{]*_/.test(text);
        
        // Check for incomplete fractions
        const hasIncompleteFractions = /\\frac\{[^}]*\}(?!\{)/.test(text);
        
        return beginMatches !== endMatches || 
               dollarMatches % 2 !== 0 || 
               hasIncompleteCommands || 
               hasProblematicText || 
               hasInvalidFunctions || 
               hasInvalidTrigSyntax ||
               hasUnmatchedParens ||
               hasUnmatchedBrackets ||
               hasUnmatchedBraces ||
               hasDoubleScripts ||
               hasIncompleteFractions;
    }

    hasUnmatchedDelimiters(text, open, close) {
        let count = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === open) count++;
            if (text[i] === close) count--;
            if (count < 0) return true; // More closing than opening
        }
        return count !== 0; // Unmatched delimiters
    }

    addGeneratedQuestions(questions) {
        if (!window.game) return;

        questions.forEach(q => {
            window.game.addQuestion();
            const questionItems = document.querySelectorAll('.question-item');
            const newQuestionItem = questionItems[questionItems.length - 1];
            
            // Set question text
            const questionTextarea = newQuestionItem.querySelector('.question-text');
            questionTextarea.value = q.question;
            
            // Set question type
            const typeSelect = newQuestionItem.querySelector('.question-type');
            typeSelect.value = q.type;
            updateQuestionType(typeSelect);
            
            // Set difficulty
            const difficultySelect = newQuestionItem.querySelector('.question-difficulty');
            if (q.difficulty === 'easy') difficultySelect.value = 'easy';
            else if (q.difficulty === 'hard') difficultySelect.value = 'hard';
            else difficultySelect.value = 'medium';
            
            // Set time limit
            const timeInput = newQuestionItem.querySelector('.question-time-limit');
            timeInput.value = q.timeLimit || 20;
            
            // Set question-specific data
            this.setQuestionData(newQuestionItem, q);
        });

        // Update preview if it's open
        if (window.game && window.game.updateSplitPreview) {
            window.game.updateSplitPreview();
        }
    }

    setQuestionData(questionItem, questionData) {
        switch (questionData.type) {
            case 'multiple-choice':
                const mcOptions = questionItem.querySelectorAll('.multiple-choice-options .option');
                questionData.options.forEach((option, index) => {
                    if (mcOptions[index]) {
                        mcOptions[index].value = option;
                    }
                });
                const mcCorrect = questionItem.querySelector('.multiple-choice-options .correct-answer');
                mcCorrect.value = questionData.correctAnswer;
                break;
                
            case 'true-false':
                const tfCorrect = questionItem.querySelector('.true-false-options .correct-answer');
                tfCorrect.value = questionData.correctAnswer;
                break;
                
            case 'multiple-correct':
                const multiOptions = questionItem.querySelectorAll('.multiple-correct-options .option');
                const multiCheckboxes = questionItem.querySelectorAll('.multiple-correct-options .correct-option');
                questionData.options.forEach((option, index) => {
                    if (multiOptions[index]) {
                        multiOptions[index].value = option;
                    }
                });
                questionData.correctAnswer.forEach(index => {
                    if (multiCheckboxes[index]) {
                        multiCheckboxes[index].checked = true;
                    }
                });
                break;
                
            case 'numeric':
                const numAnswer = questionItem.querySelector('.numeric-answer');
                const numTolerance = questionItem.querySelector('.numeric-tolerance');
                numAnswer.value = questionData.correctAnswer;
                numTolerance.value = questionData.tolerance || 0.1;
                break;
        }
    }

    closeModal() {
        document.getElementById('ai-generator-modal').style.display = 'none';
        // Reset form
        document.getElementById('source-content').value = '';
        document.getElementById('content-file').value = '';
        document.getElementById('generation-status').style.display = 'none';
        document.getElementById('content-type-indicator').style.display = 'none';
    }
}

// Global AI Generator functions
function openAIGeneratorModal() {
    document.getElementById('ai-generator-modal').style.display = 'flex';
    // Initialize provider change handler
    if (window.aiGenerator) {
        window.aiGenerator.handleProviderChange(document.getElementById('ai-provider').value);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new KahootGame();
    window.aiGenerator = new AIQuestionGenerator();
    
    // Initialize language selector
    const savedLanguage = localStorage.getItem('language') || 'en';
    setLanguage(savedLanguage);
    translatePage();
});
