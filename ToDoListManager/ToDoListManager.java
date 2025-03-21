// ToDoListManager.java
// This program allows the user to manage a simple to-do list.

import java.util.ArrayList;
import java.util.Scanner;

public class ToDoListManager {

    // Task class represents an individual task
    static class Task {
        String description;
        boolean completed;

        // Constructor sets description and default completion to false
        public Task(String description) {
            this.description = description;
            this.completed = false;
        }
    }

    public static void main(String[] args) {
        ArrayList<Task> tasks = new ArrayList<>();  // List to store tasks
        Scanner scanner = new Scanner(System.in);
        int choice;

        do {
            // Display the main menu
            System.out.println("Menu:");
            System.out.println("1. Add Task");
            System.out.println("2. View Tasks");
            System.out.println("3. Mark Task Completed");
            System.out.println("4. Exit");
            System.out.print("Enter your choice: ");
            choice = scanner.nextInt();
            scanner.nextLine(); // consume newline

            switch (choice) {
                case 1:
                    // Add a new task
                    System.out.print("Enter task description: ");
                    String description = scanner.nextLine();
                    tasks.add(new Task(description));
                    System.out.println("Task added.");
                    break;
                case 2:
                    // Show task list
                    if (tasks.isEmpty()) {
                        System.out.println("No tasks added yet.");
                    } else {
                        for (int i = 0; i < tasks.size(); i++) {
                            Task t = tasks.get(i);
                            String status = t.completed ? "[X]" : "[ ]";
                            System.out.println(i + ". " + status + " " + t.description);
                        }
                    }
                    break;
                case 3:
                    // Mark a task as complete
                    System.out.print("Enter task index to mark as completed: ");
                    int index = scanner.nextInt();
                    if (index >= 0 && index < tasks.size()) {
                        tasks.get(index).completed = true;
                        System.out.println("Task marked as completed.");
                    } else {
                        System.out.println("Invalid index.");
                    }
                    break;
                case 4:
                    // Exit the program
                    System.out.println("Exiting program.");
                    break;
                default:
                    System.out.println("Invalid selection. Please try again.");
            }
        } while (choice != 4);

        scanner.close();
    }
}
