SRCS += $(PROJECT)/src/main.c
SRCS += $(PROJECT)/src/common/common_data.c

INCS += $(PROJECT)/src/common/common_data.h

# ADXL355 driver
INCS += $(DRIVERS)/accel/adxl355/adxl355.h
SRCS += $(DRIVERS)/accel/adxl355/adxl355.c

# no-OS API
SRCS += $(DRIVERS)/api/no_os_gpio.c \
	$(DRIVERS)/api/no_os_spi.c  \
	$(DRIVERS)/api/no_os_i2c.c  \
	$(DRIVERS)/api/no_os_uart.c \
	$(DRIVERS)/api/no_os_irq.c  \
	$(DRIVERS)/api/no_os_dma.c  \
	$(NO-OS)/util/no_os_util.c  \
	$(NO-OS)/util/no_os_alloc.c \
	$(NO-OS)/util/no_os_mutex.c \
	$(NO-OS)/util/no_os_list.c  \
	$(NO-OS)/util/no_os_lf256fifo.c

# Maxim platform drivers
INCS += $(PLATFORM_DRIVERS)/maxim_gpio.h      \
	$(PLATFORM_DRIVERS)/maxim_spi.h       \
	$(PLATFORM_DRIVERS)/maxim_i2c.h       \
	$(PLATFORM_DRIVERS)/../common/maxim_dma.h \
	$(PLATFORM_DRIVERS)/maxim_irq.h       \
	$(PLATFORM_DRIVERS)/maxim_uart.h      \
	$(PLATFORM_DRIVERS)/maxim_uart_stdio.h

SRCS += $(PLATFORM_DRIVERS)/maxim_delay.c     \
	$(PLATFORM_DRIVERS)/maxim_gpio.c      \
	$(PLATFORM_DRIVERS)/maxim_spi.c       \
	$(PLATFORM_DRIVERS)/maxim_i2c.c       \
	$(PLATFORM_DRIVERS)/../common/maxim_dma.c \
	$(PLATFORM_DRIVERS)/maxim_irq.c       \
	$(PLATFORM_DRIVERS)/maxim_uart.c      \
	$(PLATFORM_DRIVERS)/maxim_init.c      \
	$(PLATFORM_DRIVERS)/maxim_uart_stdio.c

# no-OS headers
INCS += $(INCLUDE)/no_os_delay.h     \
	$(INCLUDE)/no_os_error.h     \
	$(INCLUDE)/no_os_gpio.h      \
	$(INCLUDE)/no_os_spi.h       \
	$(INCLUDE)/no_os_i2c.h       \
	$(INCLUDE)/no_os_uart.h      \
	$(INCLUDE)/no_os_irq.h       \
	$(INCLUDE)/no_os_dma.h       \
	$(INCLUDE)/no_os_util.h      \
	$(INCLUDE)/no_os_alloc.h     \
	$(INCLUDE)/no_os_mutex.h     \
	$(INCLUDE)/no_os_list.h      \
	$(INCLUDE)/no_os_lf256fifo.h \
	$(INCLUDE)/no_os_print_log.h \
	$(INCLUDE)/no_os_units.h     \
	$(INCLUDE)/no_os_init.h
